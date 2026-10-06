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

// Cuotas (con fecha de vencimiento) y los cobros aplicados a cada una. `courierId` limita a
// las ventas de ese repartidor.
export async function loadInstallments(courierId?: string): Promise<InstallmentRow[]> {
  const params = courierId ? [courierId] : [];
  const { rows } = await pool.query(
    `select si.id, si.sale_id as "saleId", si.number, coalesce(s.installments_total, si.number) as total,
       si.amount, si.due_date::text as "dueDate", s.client_id as "clientId", s.client_name as "clientName",
       s.courier_id as "courierId", s.courier_name as "courierName"
     from sale_installments si join sales s on s.id = si.sale_id
     where si.due_date is not null ${courierId ? 'and s.courier_id = $1' : ''}`,
    params
  );
  const { rows: pays } = await pool.query(
    `select pay.installment_id as "installmentId", pay.amount,
       to_char((to_timestamp(pay.created_at_ms / 1000.0) at time zone '${TZ}')::date, 'YYYY-MM-DD') as day
     from payments pay
     ${courierId ? 'join sale_installments si on si.id = pay.installment_id join sales s on s.id = si.sale_id' : ''}
     where pay.installment_id is not null ${courierId ? 'and s.courier_id = $1' : ''}`,
    params
  );
  const byInstallment = new Map<string, { day: string; amount: number }[]>();
  for (const p of pays) {
    const list = byInstallment.get(p.installmentId) ?? [];
    list.push({ day: p.day, amount: Number(p.amount) });
    byInstallment.set(p.installmentId, list);
  }
  return rows.map((r) => ({
    ...r,
    number: Number(r.number),
    total: Number(r.total),
    amount: Number(r.amount),
    payments: byInstallment.get(r.id) ?? [],
  }));
}
