import { pool } from './db/client.js';

// Todas las fechas de cobranza se manejan como 'YYYY-MM-DD' en hora de Argentina; la semana
// arranca el lunes. El servidor corre en UTC, así que nada acá depende de la zona local.
const TZ = 'America/Argentina/Buenos_Aires';

export function arToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Suma meses conservando el día; si el mes destino es más corto cae en su último día (31/1 + 1 mes = 28/2). */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return addDays(dateStr, -((d.getUTCDay() + 6) % 7));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}

export interface InstallmentRow {
  id: string;
  saleId: string;
  number: number;
  total: number;
  amount: number;
  dueDate: string;
  clientId: string | null;
  clientName: string;
  courierId: string;
  courierName: string;
  /** Cobros aplicados a esta cuota: [día (YYYY-MM-DD), monto]. */
  payments: { day: string; amount: number }[];
}

export function paidUntil(inst: InstallmentRow, beforeDay?: string): number {
  return inst.payments.reduce((sum, p) => (beforeDay === undefined || p.day < beforeDay ? sum + p.amount : sum), 0);
}

// Día (hora de Argentina) en que se registró un cobro, como expresión SQL.
const PAY_DAY = `(to_timestamp(pay.created_at_ms / 1000.0) at time zone '${TZ}')::date`;

const INSTALLMENT_COLUMNS = `si.id, si.sale_id as "saleId", si.number, coalesce(s.installments_total, si.number) as total,
  si.amount, si.due_date::text as "dueDate", s.client_id as "clientId", s.client_name as "clientName",
  s.courier_id as "courierId", s.courier_name as "courierName"`;

/**
 * Cuotas que importan para los objetivos de las semanas entre `from` (inclusive) y `to`
 * (exclusive), con los cobros aplicados a cada una: las que vencen en ese rango y las más viejas
 * que al empezar el rango todavía no estaban cobradas del todo (el "arrastre").
 *
 * Con años de historial cargado, traer todas las cuotas y todos los cobros en cada consulta
 * (esto se refresca cada pocos segundos) no escala; lo ya cobrado antes del rango no cambia
 * ningún número de esas semanas, así que se filtra en la base.
 */
export async function loadInstallmentsWindow(from: string, to: string, courierId?: string): Promise<InstallmentRow[]> {
  // Inicio del rango como instante (medianoche de Argentina, UTC-3 todo el año).
  const params: unknown[] = [from, to, Date.parse(`${from}T00:00:00-03:00`)];
  if (courierId) params.push(courierId);
  const { rows } = await pool.query(
    `with paid_before as (
       select pay.installment_id, sum(pay.amount) as amount
       from payments pay
       where pay.installment_id is not null and pay.created_at_ms < $3
       group by pay.installment_id
     ), wanted as (
       select ${INSTALLMENT_COLUMNS}
       from sale_installments si
       join sales s on s.id = si.sale_id
       left join paid_before pb on pb.installment_id = si.id
       where si.due_date is not null and si.due_date < $2::date
         and (si.due_date >= $1::date or si.amount - coalesce(pb.amount, 0) > 0.005)
         ${courierId ? 'and s.courier_id = $4' : ''}
     )
     select w.*, coalesce((
       select json_agg(json_build_object('day', to_char(${PAY_DAY}, 'YYYY-MM-DD'), 'amount', pay.amount))
       from payments pay where pay.installment_id = w.id
     ), '[]'::json) as payments
     from wanted w`,
    params
  );
  return rows.map((r) => ({
    ...r,
    number: Number(r.number),
    total: Number(r.total),
    amount: Number(r.amount),
    payments: (r.payments as { day: string; amount: number | string }[]).map((p) => ({ day: p.day, amount: Number(p.amount) })),
  }));
}

export interface OpenInstallmentRow extends Omit<InstallmentRow, 'payments'> {
  /** Total cobrado de esta cuota hasta ahora. */
  paid: number;
}

/** Cuotas que vencieron antes de `dueBefore` y todavía no están cobradas del todo. */
export async function loadOverdueInstallments(dueBefore: string, courierId?: string): Promise<OpenInstallmentRow[]> {
  const params: unknown[] = [dueBefore];
  if (courierId) params.push(courierId);
  const { rows } = await pool.query(
    `select ${INSTALLMENT_COLUMNS}, coalesce(p.paid, 0) as paid
     from sale_installments si
     join sales s on s.id = si.sale_id
     left join (
       select installment_id, sum(amount) as paid from payments where installment_id is not null group by installment_id
     ) p on p.installment_id = si.id
     where si.due_date is not null and si.due_date < $1::date
       and si.amount - coalesce(p.paid, 0) > 0.005
       ${courierId ? 'and s.courier_id = $2' : ''}`,
    params
  );
  return rows.map((r) => ({ ...r, number: Number(r.number), total: Number(r.total), amount: Number(r.amount), paid: Number(r.paid) }));
}

// ─── Caché corto de los cálculos de cobranza ────────────────────────────────────
// Objetivos y Atrasados se refrescan cada pocos segundos desde cada pantalla abierta y todos
// piden lo mismo. El resultado se guarda unos segundos y se descarta apenas cambia algo
// (una venta o un cobro nuevo, editado o borrado), así nadie ve un número viejo por eso.

const CACHE_TTL_MS = 30_000;
let dataVersion = 0;
const cache = new Map<string, { version: number; at: number; value: Promise<unknown> }>();

/** Avisar que cambiaron ventas, cuotas o cobros: invalida lo calculado. */
export function collectionsChanged(): void {
  dataVersion += 1;
}

export function cachedCollections<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.version === dataVersion && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  const value = compute();
  cache.set(key, { version: dataVersion, at: Date.now(), value });
  // Un error no se queda guardado: la próxima consulta vuelve a intentar.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}
