import { z } from 'zod/v4';
import type Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/client.js';
import type { AuthClaims, StaffRole } from '../auth.js';
import { applyPriceChange } from '../routes/catalog.js';
import type { InternalApi } from './internalApi.js';

// ─── Tipos ──────────────────────────────────────────────────────────────────────

export interface ToolContext {
  user: AuthClaims;
  api: InternalApi;
}

export interface ToolOutput {
  /** Lo que recibe el modelo (se serializa a JSON). */
  data: unknown;
  /** Una línea para mostrarle al usuario en el chat. */
  summary: string;
}

export type PreviewResult = { ok: true; title: string; details: string[]; warning?: string } | { ok: false; error: string };

export interface AiTool {
  name: string;
  /** Texto corto para el chat ("Buscando productos"). */
  label: string;
  kind: 'read' | 'write';
  roles: StaffRole[];
  description: string;
  schema: z.ZodType;
  preview?: (input: never, ctx: ToolContext) => Promise<PreviewResult>;
  run: (input: never, ctx: ToolContext) => Promise<ToolOutput>;
}

function defineTool<S extends z.ZodType>(def: {
  name: string;
  label: string;
  kind: 'read' | 'write';
  roles: StaffRole[];
  description: string;
  schema: S;
  preview?: (input: z.infer<S>, ctx: ToolContext) => Promise<PreviewResult>;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutput>;
}): AiTool {
  return def as unknown as AiTool;
}

/** Error esperable (dato inexistente, validación): se le devuelve tal cual al modelo. */
export class ToolError extends Error {}

// ─── Utilidades ─────────────────────────────────────────────────────────────────

const TZ = 'America/Argentina/Buenos_Aires';
const BOTH: StaffRole[] = ['admin', 'repartidor', 'vendedor'];
const ADMIN: StaffRole[] = ['admin'];

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
export const fmtMoney = (n: number) => money.format(n);
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('es-AR', { timeZone: TZ });
const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Repartidores y vendedores: solo ven y cargan lo propio. */
const isRepartidor = (ctx: ToolContext) => ctx.user.role !== 'admin';

// Costo de un producto para el admin: se guarda sin IVA (como en la lista del proveedor); el
// precio de venta es final, con IVA, así que la ganancia se mide contra el costo con IVA.
function costFields(unitPrice: number, costPrice: number | null, ivaRate: number) {
  if (costPrice === null) return { costo_sin_iva: null };
  const full = Math.round(costPrice * (1 + ivaRate / 100) * 100) / 100;
  return {
    costo_sin_iva: costPrice,
    costo_con_iva: full,
    ...(full > 0 ? { ganancia_pct: Math.round((unitPrice / full - 1) * 1000) / 10 } : {}),
  };
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.')
  .describe('Fecha en formato AAAA-MM-DD (hora de Argentina).');

/** Rango [desde, hasta] inclusive en hora de Argentina → milisegundos. */
function dateRangeMs(desde?: string, hasta?: string): { from?: number; to?: number } {
  return {
    from: desde ? Date.parse(`${desde}T00:00:00-03:00`) : undefined,
    to: hasta ? Date.parse(`${hasta}T00:00:00-03:00`) + 86_400_000 : undefined,
  };
}

/** Condiciones ILIKE para que todas las palabras aparezcan en alguna de las columnas. */
function wordConditions(text: string | undefined, params: unknown[], columns: string[]): string[] {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return words.map((w) => {
    params.push(`%${w.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    return `(${columns.map((c) => `${c} ilike ${p}`).join(' or ')})`;
  });
}

interface ProductRow {
  code: string;
  description: string;
  unitPrice: number;
  stock: number;
  costPrice: number | null;
  ivaRate: number;
  total: number;
}

const productFilterSchema = {
  texto: z
    .string()
    .optional()
    .describe('Palabras a buscar en la descripción o el código; tienen que aparecer todas (ej: "tornillo 6x50"). No distingue mayúsculas, pero sí acentos: si no encontrás nada, probá la palabra con y sin acento.'),
  codigos: z.array(z.string()).max(500).optional().describe('Códigos exactos de producto.'),
};

async function findProducts(
  f: { texto?: string; codigos?: string[]; stock?: 'todos' | 'sin_stock' | 'con_stock'; stockMaximo?: number },
  limit: number | null
): Promise<ProductRow[]> {
  const params: unknown[] = [];
  const where = ['active = true', ...wordConditions(f.texto, params, ['description', 'code'])];
  if (f.codigos?.length) {
    params.push(f.codigos);
    where.push(`code = any($${params.length}::text[])`);
  }
  if (f.stock === 'sin_stock') where.push('stock <= 0');
  if (f.stock === 'con_stock') where.push('stock > 0');
  if (f.stockMaximo !== undefined) {
    params.push(f.stockMaximo);
    where.push(`stock <= $${params.length}`);
  }
  let limitSql = '';
  if (limit !== null) {
    params.push(limit);
    limitSql = `limit $${params.length}`;
  }
  const { rows } = await pool.query(
    `select code, description, unit_price as "unitPrice", stock, cost_price as "costPrice", iva_rate as "ivaRate",
       count(*) over () as total
     from catalog_products where ${where.join(' and ')}
     order by description ${limitSql}`,
    params
  );
  return rows.map((r) => ({
    ...r,
    unitPrice: Number(r.unitPrice),
    stock: Number(r.stock),
    costPrice: r.costPrice === null ? null : Number(r.costPrice),
    ivaRate: Number(r.ivaRate),
    total: Number(r.total),
  }));
}

async function getProduct(code: string) {
  const { rows } = await pool.query(
    `select code, description, unit_price as "unitPrice", stock, cost_price as "costPrice", iva_rate as "ivaRate", active
     from catalog_products where code = $1`,
    [code]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    code: r.code as string,
    description: r.description as string,
    unitPrice: Number(r.unitPrice),
    stock: Number(r.stock),
    costPrice: r.costPrice === null ? null : Number(r.costPrice),
    ivaRate: Number(r.ivaRate),
    active: r.active as boolean,
  };
}

async function getClient(id: string) {
  const { rows } = await pool.query(
    `select c.id, c.name, c.address, c.phone, c.notes, c.type, c.active,
       coalesce((select sum(amount) from sales where client_id = c.id), 0)
         - coalesce((select sum(amount) from payments where client_id = c.id), 0) as balance
     from clients c where c.id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    address: r.address as string,
    phone: (r.phone as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    type: r.type as 'cliente' | 'taller',
    active: r.active as boolean,
    balance: Number(r.balance),
  };
}

async function requireActiveClient(id: string) {
  const c = await getClient(id);
  if (!c || !c.active) throw new ToolError(`No existe un cliente activo con id "${id}". Buscalo primero con buscar_clientes.`);
  return c;
}

async function getStaff(id: string) {
  const { rows } = await pool.query(`select id, name, role, active from staff where id = $1`, [id]);
  return (rows[0] as { id: string; name: string; role: StaffRole; active: boolean } | undefined) ?? null;
}

async function requireActiveStaff(id: string) {
  const s = await getStaff(id);
  if (!s || !s.active) throw new ToolError(`No existe un usuario activo con id "${id}". Consultá ver_equipo.`);
  return s;
}

async function getList(id: string) {
  const { rows } = await pool.query(
    `select id, name, weekdays, courier_id as "courierId", courier_name as "courierName",
       (select count(*)::int from delivery_list_clients where list_id = l.id) as "clientCount"
     from delivery_lists l where id = $1`,
    [id]
  );
  return (rows[0] as { id: string; name: string; weekdays: number[]; courierId: string | null; courierName: string | null; clientCount: number } | undefined) ?? null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Una línea "antes → después" solo si el valor cambia. */
function diff(label: string, before: unknown, after: unknown, fmt: (v: never) => string = (v) => String(v ?? '—')): string | null {
  if (after === undefined || before === after) return null;
  return `${label}: ${fmt(before as never)} → ${fmt(after as never)}`;
}

// ─── Consultas ──────────────────────────────────────────────────────────────────

const buscarProductos = defineTool({
  name: 'buscar_productos',
  label: 'Buscando productos',
  kind: 'read',
  roles: BOTH,
  description:
    'Busca productos activos del catálogo con su precio de venta (final, con IVA), stock e IVA; solo para administradores, también el costo sin IVA, el costo con IVA y la ganancia sobre el costo con IVA. Usala siempre antes de responder sobre precios o stock, y antes de modificar un producto para obtener su código exacto.',
  schema: z.object({
    ...productFilterSchema,
    stock: z.enum(['todos', 'sin_stock', 'con_stock']).optional().describe('Filtrar por stock. Por defecto "todos".'),
    stockMaximo: z.number().int().optional().describe('Solo productos con stock menor o igual a este número (para "stock bajo").'),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de filas a devolver (por defecto 30).'),
  }),
  run: async (input, ctx) => {
    const rows = await findProducts(input, input.limite ?? 30);
    const total = rows[0]?.total ?? 0;
    const hideCost = isRepartidor(ctx);
    return {
      data: {
        total,
        mostrados: rows.length,
        productos: rows.map((p) => ({
          codigo: p.code,
          descripcion: p.description,
          precio: p.unitPrice,
          stock: p.stock,
          iva: p.ivaRate,
          ...(hideCost ? {} : costFields(p.unitPrice, p.costPrice, p.ivaRate)),
        })),
      },
      summary: total === rows.length ? plural(total, 'producto encontrado', 'productos encontrados') : `${total} productos (mostrando ${rows.length})`,
    };
  },
});

const buscarClientes = defineTool({
  name: 'buscar_clientes',
  label: 'Buscando clientes',
  kind: 'read',
  roles: BOTH,
  description:
    'Busca clientes activos por nombre, dirección o teléfono y devuelve su id, datos de contacto y saldo de cuenta corriente (ventas - cobros; positivo = nos debe). Usala para obtener el id antes de consultar o modificar un cliente.',
  schema: z.object({
    texto: z.string().optional().describe('Palabras a buscar en nombre, dirección o teléfono. Vacío = todos.'),
    tipo: z.enum(['cliente', 'taller']).optional(),
    soloConDeuda: z.boolean().optional().describe('Solo clientes con saldo pendiente mayor a cero.'),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de filas (por defecto 30).'),
  }),
  run: async (input) => {
    const params: unknown[] = [];
    const where = ['c.active = true', ...wordConditions(input.texto, params, ['c.name', 'c.address', "coalesce(c.phone, '')"])];
    if (input.tipo) {
      params.push(input.tipo);
      where.push(`c.type = $${params.length}`);
    }
    const balanceExpr = `(coalesce((select sum(amount) from sales where client_id = c.id), 0)
      - coalesce((select sum(amount) from payments where client_id = c.id), 0))`;
    if (input.soloConDeuda) where.push(`${balanceExpr} > 0.005`);
    params.push(input.limite ?? 30);
    const { rows } = await pool.query(
      `select c.id, c.name, c.address, c.phone, c.type, c.notes, ${balanceExpr} as balance, count(*) over () as total
       from clients c where ${where.join(' and ')}
       order by ${input.soloConDeuda ? 'balance desc' : 'c.name'} limit $${params.length}`,
      params
    );
    const total = Number(rows[0]?.total ?? 0);
    return {
      data: {
        total,
        mostrados: rows.length,
        clientes: rows.map((r) => ({
          id: r.id,
          nombre: r.name,
          direccion: r.address,
          telefono: r.phone,
          tipo: r.type,
          notas: r.notes,
          saldo: round2(Number(r.balance)),
        })),
      },
      summary: plural(total, 'cliente encontrado', 'clientes encontrados'),
    };
  },
});

const verCuentaCliente = defineTool({
  name: 'ver_cuenta_cliente',
  label: 'Revisando la cuenta del cliente',
  kind: 'read',
  roles: BOTH,
  description:
    'Detalle de la cuenta corriente de un cliente: saldo, últimas ventas (con productos y cuotas), últimos cobros y cuotas pendientes con su id (necesario para registrar un cobro aplicado a una cuota).',
  schema: z.object({ clienteId: z.string().min(1).describe('Id del cliente (obtenelo con buscar_clientes).') }),
  run: async (input, ctx) => {
    const client = await requireActiveClient(input.clienteId);
    type Statement = {
      sales: {
        id: string;
        amount: number;
        description: string | null;
        courierName: string;
        createdAt: number;
        items: { code: string | null; description: string; quantity: number; unitPrice: number }[];
        installments: { id: string; number: number; amount: number; dueDate: string | null; paid: number }[];
      }[];
      payments: { id: string; amount: number; method: string; courierName: string; installmentId: string | null; createdAt: number }[];
    };
    const st = await ctx.api.get<Statement>(`/clients/${encodeURIComponent(client.id)}/statement`);
    const pendingInstallments = st.sales.flatMap((s) =>
      s.installments
        .map((i) => ({ ...i, amount: Number(i.amount), paid: Number(i.paid) }))
        .filter((i) => i.amount - i.paid > 0.005)
        .map((i) => ({
          cuotaId: i.id,
          venta: fmtDate(s.createdAt),
          numero: `${i.number}/${s.installments.length}`,
          vence: i.dueDate ? fmtDate(Date.parse(`${String(i.dueDate).slice(0, 10)}T12:00:00-03:00`)) : null,
          monto: i.amount,
          pagado: round2(i.paid),
          restante: round2(i.amount - i.paid),
        }))
    );
    return {
      data: {
        cliente: { id: client.id, nombre: client.name, direccion: client.address, telefono: client.phone, tipo: client.type, notas: client.notes },
        saldo: round2(client.balance),
        cuotasPendientes: pendingInstallments,
        ultimasVentas: st.sales.slice(0, 15).map((s) => ({
          fecha: fmtDate(s.createdAt),
          monto: s.amount,
          vendedor: s.courierName,
          detalle: s.description,
          productos: s.items.map((i) => `${i.quantity} x ${i.description}`).join('; '),
          cuotas: s.installments.length || null,
        })),
        ultimosCobros: st.payments.slice(0, 15).map((p) => ({
          fecha: fmtDate(p.createdAt),
          monto: p.amount,
          medio: p.method,
          cobradoPor: p.courierName,
          aplicadoACuota: !!p.installmentId,
        })),
        totalVentas: st.sales.length,
        totalCobros: st.payments.length,
      },
      summary: `${client.name}: saldo ${fmtMoney(client.balance)}`,
    };
  },
});

const consultarVentas = defineTool({
  name: 'consultar_ventas',
  label: 'Consultando ventas',
  kind: 'read',
  roles: BOTH,
  description:
    'Lista ventas cargadas con filtros de fecha, cliente y vendedor, y devuelve el total vendido del período. A un repartidor solo le muestra sus propias ventas.',
  schema: z.object({
    desde: dateField.optional(),
    hasta: dateField.optional().describe('Fecha final inclusive, AAAA-MM-DD.'),
    clienteId: z.string().optional(),
    repartidorId: z.string().optional().describe('Id del vendedor/repartidor (solo administradores).'),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de ventas a listar (por defecto 30). El total se calcula sobre todas.'),
  }),
  run: async (input, ctx) => {
    const params: unknown[] = [];
    const where: string[] = [];
    const courier = isRepartidor(ctx) ? ctx.user.sub : input.repartidorId;
    if (courier) {
      params.push(courier);
      where.push(`s.courier_id = $${params.length}`);
    }
    if (input.clienteId) {
      params.push(input.clienteId);
      where.push(`s.client_id = $${params.length}`);
    }
    const { from, to } = dateRangeMs(input.desde, input.hasta);
    if (from !== undefined) {
      params.push(from);
      where.push(`s.created_at_ms >= $${params.length}`);
    }
    if (to !== undefined) {
      params.push(to);
      where.push(`s.created_at_ms < $${params.length}`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const [{ rows: totals }, { rows }] = await Promise.all([
      pool.query(`select count(*)::int as n, coalesce(sum(amount), 0) as total from sales s ${whereSql}`, params),
      pool.query(
        `select s.client_name as "clientName", s.courier_name as "courierName", s.amount, s.description,
           s.installments_total as "installments", s.created_at_ms as "createdAt",
           (select string_agg(i.quantity || ' x ' || i.description, '; ' order by i.position) from sale_items i where i.sale_id = s.id) as items
         from sales s ${whereSql} order by s.created_at_ms desc limit ${input.limite ?? 30}`,
        params
      ),
    ]);
    const n = totals[0].n as number;
    const total = Number(totals[0].total);
    return {
      data: {
        cantidad: n,
        totalVendido: round2(total),
        mostradas: rows.length,
        ventas: rows.map((r) => ({
          fecha: fmtDate(Number(r.createdAt)),
          cliente: r.clientName,
          vendedor: r.courierName,
          monto: Number(r.amount),
          productos: r.items,
          detalle: r.description,
          cuotas: r.installments,
        })),
      },
      summary: `${plural(n, 'venta', 'ventas')} · ${fmtMoney(total)}`,
    };
  },
});

const consultarCobros = defineTool({
  name: 'consultar_cobros',
  label: 'Consultando cobros',
  kind: 'read',
  roles: BOTH,
  description:
    'Lista cobros registrados con filtros de fecha, cliente, medio de pago y quién cobró, y devuelve el total cobrado. A un repartidor solo le muestra sus propios cobros.',
  schema: z.object({
    desde: dateField.optional(),
    hasta: dateField.optional().describe('Fecha final inclusive, AAAA-MM-DD.'),
    clienteId: z.string().optional(),
    repartidorId: z.string().optional().describe('Id de quien cobró (solo administradores).'),
    medio: z.enum(['efectivo', 'transferencia', 'cheque', 'otro']).optional(),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de cobros a listar (por defecto 30). El total se calcula sobre todos.'),
  }),
  run: async (input, ctx) => {
    const params: unknown[] = [];
    const where: string[] = [];
    const courier = isRepartidor(ctx) ? ctx.user.sub : input.repartidorId;
    if (courier) {
      params.push(courier);
      where.push(`courier_id = $${params.length}`);
    }
    if (input.clienteId) {
      params.push(input.clienteId);
      where.push(`client_id = $${params.length}`);
    }
    if (input.medio) {
      params.push(input.medio);
      where.push(`method = $${params.length}`);
    }
    const { from, to } = dateRangeMs(input.desde, input.hasta);
    if (from !== undefined) {
      params.push(from);
      where.push(`created_at_ms >= $${params.length}`);
    }
    if (to !== undefined) {
      params.push(to);
      where.push(`created_at_ms < $${params.length}`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const [{ rows: totals }, { rows }] = await Promise.all([
      pool.query(`select count(*)::int as n, coalesce(sum(amount), 0) as total from payments ${whereSql}`, params),
      pool.query(
        `select client_name as "clientName", courier_name as "courierName", amount, method, check_number as "checkNumber",
           bank, notes, installment_id as "installmentId", created_at_ms as "createdAt"
         from payments ${whereSql} order by created_at_ms desc limit ${input.limite ?? 30}`,
        params
      ),
    ]);
    const n = totals[0].n as number;
    const total = Number(totals[0].total);
    return {
      data: {
        cantidad: n,
        totalCobrado: round2(total),
        mostrados: rows.length,
        cobros: rows.map((r) => ({
          fecha: fmtDate(Number(r.createdAt)),
          cliente: r.clientName,
          cobradoPor: r.courierName,
          monto: Number(r.amount),
          medio: r.method,
          cheque: r.checkNumber ? `${r.checkNumber}${r.bank ? ` (${r.bank})` : ''}` : undefined,
          notas: r.notes,
          aplicadoACuota: !!r.installmentId,
        })),
      },
      summary: `${plural(n, 'cobro', 'cobros')} · ${fmtMoney(total)}`,
    };
  },
});

const verAtrasados = defineTool({
  name: 'ver_atrasados',
  label: 'Revisando cuotas atrasadas',
  kind: 'read',
  roles: BOTH,
  description:
    'Clientes con cuotas vencidas en semanas anteriores y todavía sin cobrar (cuántas, cuánto falta y hace cuántas semanas). A un repartidor solo le muestra las de sus ventas.',
  schema: z.object({
    clienteId: z.string().optional().describe('Para ver solo un cliente.'),
    limite: z.number().int().min(1).max(100).optional().describe('Máximo de clientes (por defecto 30, ordenados por atraso).'),
  }),
  run: async (input, ctx) => {
    type Overdue = {
      clients: {
        clientId: string | null;
        clientName: string;
        courierNames: string[];
        overdueCount: number;
        totalRemaining: number;
        maxWeeksLate: number;
        installments: { id: string; number: number; total: number; dueDate: string; weeksLate: number; remaining: number }[];
      }[];
      totalRemaining: number;
      totalInstallments: number;
    };
    const report = await ctx.api.get<Overdue>('/overdue');
    const list = input.clienteId ? report.clients.filter((c) => c.clientId === input.clienteId) : report.clients;
    const shown = list.slice(0, input.limite ?? 30);
    return {
      data: {
        totalAtrasado: report.totalRemaining,
        cuotasAtrasadas: report.totalInstallments,
        clientesConAtraso: report.clients.length,
        clientes: shown.map((c) => ({
          clienteId: c.clientId,
          cliente: c.clientName,
          vendedores: c.courierNames.join(', '),
          cuotas: c.overdueCount,
          debe: c.totalRemaining,
          semanasDeAtraso: c.maxWeeksLate,
          detalle: c.installments.map((i) => ({ cuotaId: i.id, cuota: `${i.number}/${i.total}`, vencio: i.dueDate, falta: i.remaining })),
        })),
      },
      summary: `${plural(report.clients.length, 'cliente atrasado', 'clientes atrasados')} · ${fmtMoney(report.totalRemaining)}`,
    };
  },
});

const verObjetivos = defineTool({
  name: 'ver_objetivos',
  label: 'Revisando objetivos de cobranza',
  kind: 'read',
  roles: BOTH,
  description:
    'Objetivo de cobranza semanal de cada vendedor (cuotas que vencen en la semana + lo que arrastra sin cobrar), cuánto lleva cobrado y cuánto le falta. A un repartidor solo le muestra el suyo.',
  schema: z.object({}),
  run: async (_input, ctx) => {
    type Goals = {
      couriers: {
        courierName: string;
        weeks: { weekStart: string; weekEnd: string; state: string; target: number; carry: number; collected: number; pending: number }[];
      }[];
    };
    const goals = await ctx.api.get<Goals>('/goals');
    const pick = (weeks: Goals['couriers'][number]['weeks']) => {
      const i = weeks.findIndex((w) => w.state === 'actual');
      return weeks.slice(Math.max(0, i - 1), i + 2);
    };
    return {
      data: goals.couriers.map((c) => ({
        vendedor: c.courierName,
        semanas: pick(c.weeks).map((w) => ({
          semana: `${w.weekStart} a ${w.weekEnd}`,
          estado: w.state,
          objetivo: w.target,
          arrastre: w.carry,
          cobrado: w.collected,
          falta: w.pending,
        })),
      })),
      summary: plural(goals.couriers.length, 'vendedor', 'vendedores'),
    };
  },
});

const resumenNegocio = defineTool({
  name: 'resumen_negocio',
  label: 'Armando el resumen del negocio',
  kind: 'read',
  roles: ADMIN,
  description:
    'Resumen general: ventas y cobros de la semana y del mes con proyección, total atrasado, productos sin stock, cantidad de clientes y deudas pendientes con proveedores. Usala para preguntas generales sobre "cómo viene el negocio".',
  schema: z.object({}),
  run: async (_input, ctx) => {
    type Stats = {
      avgDailyCobros: number;
      avgDailyVentas: number;
      semana: Record<string, number>;
      mes: Record<string, number>;
    };
    const [stats, overdue, { rows: counts }] = await Promise.all([
      ctx.api.get<Stats>('/stats/dashboard'),
      ctx.api.get<{ totalRemaining: number; clients: unknown[] }>('/overdue'),
      pool.query(`select
        (select count(*)::int from catalog_products where active) as products,
        (select count(*)::int from catalog_products where active and stock <= 0) as "noStock",
        (select count(*)::int from clients where active) as clients,
        (select coalesce(sum(amount), 0) from supplier_debts where status = 'pendiente') as "supplierDebt",
        (select count(*)::int from supplier_debts where status = 'pendiente' and due_date < (now() at time zone '${TZ}')::date) as "supplierOverdue"`),
    ]);
    const c = counts[0];
    return {
      data: {
        semana: stats.semana,
        mes: stats.mes,
        promedioDiarioUltimos28Dias: { ventas: round2(stats.avgDailyVentas), cobros: round2(stats.avgDailyCobros) },
        atrasado: { total: overdue.totalRemaining, clientes: overdue.clients.length },
        productos: { activos: c.products, sinStock: c.noStock },
        clientesActivos: c.clients,
        proveedores: { deudaPendiente: Number(c.supplierDebt), facturasVencidas: c.supplierOverdue },
      },
      summary: 'Resumen listo',
    };
  },
});

const verEquipo = defineTool({
  name: 'ver_equipo',
  label: 'Consultando el equipo',
  kind: 'read',
  roles: ADMIN,
  description: 'Lista los usuarios del sistema (id, nombre, rol y si están activos). Usala para obtener el id de un vendedor/repartidor.',
  schema: z.object({}),
  run: async (_input, ctx) => {
    const { staff } = await ctx.api.get<{ staff: { id: string; name: string; role: string; active: boolean }[] }>('/team');
    return {
      data: staff.map((s) => ({ id: s.id, nombre: s.name, rol: s.role, activo: s.active })),
      summary: plural(staff.length, 'usuario', 'usuarios'),
    };
  },
});

const verListasReparto = defineTool({
  name: 'ver_listas_reparto',
  label: 'Consultando listas de reparto',
  kind: 'read',
  roles: ADMIN,
  description:
    'Listas de reparto semanales (planificación): días de la semana, repartidor asignado y sus clientes en orden. Usala antes de modificar una lista para obtener su id.',
  schema: z.object({ listaId: z.string().optional().describe('Para ver una sola lista.') }),
  run: async (input) => {
    const { rows } = await pool.query(
      `select l.id, l.name, l.weekdays, l.courier_id as "courierId", l.courier_name as "courierName",
         coalesce(json_agg(json_build_object('id', c.id, 'nombre', c.name, 'direccion', c.address) order by lc.order_num)
           filter (where c.id is not null), '[]'::json) as clients
       from delivery_lists l
       left join delivery_list_clients lc on lc.list_id = l.id
       left join clients c on c.id = lc.client_id
       ${input.listaId ? 'where l.id = $1' : ''}
       group by l.id order by l.name`,
      input.listaId ? [input.listaId] : []
    );
    return {
      data: rows.map((l) => ({
        id: l.id,
        nombre: l.name,
        dias: (l.weekdays as number[]).map((d) => WEEKDAYS[d]),
        repartidor: l.courierName ? { id: l.courierId, nombre: l.courierName } : null,
        clientes: l.clients,
      })),
      summary: plural(rows.length, 'lista', 'listas'),
    };
  },
});

const verProveedores = defineTool({
  name: 'ver_proveedores',
  label: 'Consultando proveedores',
  kind: 'read',
  roles: ADMIN,
  description: 'Proveedores activos y sus deudas (facturas pendientes o pagadas, vencimientos, montos). Usala para obtener ids de proveedores y de deudas.',
  schema: z.object({ soloPendientes: z.boolean().optional().describe('Solo deudas pendientes (por defecto true).') }),
  run: async (input, ctx) => {
    const [{ suppliers }, { debts }] = await Promise.all([
      ctx.api.get<{ suppliers: { id: string; name: string; phone: string | null; notes: string | null }[] }>('/suppliers'),
      ctx.api.get<{
        debts: { id: string; supplierId: string; supplierName: string; invoiceNumber: string | null; amount: number; issueDate: string | null; dueDate: string | null; status: string; paymentMethod: string | null; notes: string | null }[];
      }>('/supplier-debts'),
    ]);
    const onlyPending = input.soloPendientes ?? true;
    const shown = debts.filter((d) => !onlyPending || d.status === 'pendiente').slice(0, 60);
    const pendingTotal = debts.filter((d) => d.status === 'pendiente').reduce((s, d) => s + d.amount, 0);
    return {
      data: {
        proveedores: suppliers.map((s) => ({ id: s.id, nombre: s.name, telefono: s.phone, notas: s.notes })),
        totalPendiente: round2(pendingTotal),
        deudas: shown.map((d) => ({
          id: d.id,
          proveedor: d.supplierName,
          proveedorId: d.supplierId,
          factura: d.invoiceNumber,
          monto: d.amount,
          emision: d.issueDate,
          vence: d.dueDate,
          estado: d.status,
          pagadoCon: d.paymentMethod,
          notas: d.notes,
        })),
      },
      summary: `${plural(suppliers.length, 'proveedor', 'proveedores')} · pendiente ${fmtMoney(pendingTotal)}`,
    };
  },
});

const verCamioneta = defineTool({
  name: 'ver_camioneta',
  label: 'Revisando la camioneta',
  kind: 'read',
  roles: ADMIN,
  description: 'Mercadería que está cargada en la camioneta (fuera del depósito) y los últimos movimientos de carga, devolución y muestras.',
  schema: z.object({}),
  run: async (_input, ctx) => {
    const van = await ctx.api.get<{
      items: { code: string; description: string; unitPrice: number; quantity: number }[];
      movements: { code: string; description: string; quantity: number; kind: string; courierName: string | null; staffName: string; createdAt: number }[];
    }>('/van');
    return {
      data: {
        enCamioneta: van.items.map((i) => ({ codigo: i.code, descripcion: i.description, cantidad: i.quantity, precio: i.unitPrice })),
        ultimosMovimientos: van.movements.slice(0, 20).map((m) => ({
          fecha: fmtDate(m.createdAt),
          tipo: m.kind,
          producto: `${m.code} · ${m.description}`,
          cantidad: m.quantity,
          repartidor: m.courierName,
          hizo: m.staffName,
        })),
      },
      summary: plural(van.items.length, 'producto en la camioneta', 'productos en la camioneta'),
    };
  },
});

const verActividad = defineTool({
  name: 'ver_actividad',
  label: 'Revisando la actividad',
  kind: 'read',
  roles: ADMIN,
  description: 'Últimas acciones registradas en el sistema (quién hizo qué y cuándo). Las hechas por la IA aparecen con "[IA]".',
  schema: z.object({
    usuarioId: z.string().optional().describe('Filtrar por un usuario.'),
    limite: z.number().int().min(1).max(100).optional().describe('Por defecto 30.'),
  }),
  run: async (input, ctx) => {
    const qs = input.usuarioId ? `?staffId=${encodeURIComponent(input.usuarioId)}` : '';
    const { logs } = await ctx.api.get<{ logs: { staffName: string; action: string; summary: string; createdAt: number }[] }>(`/logs${qs}`);
    const shown = logs.slice(0, input.limite ?? 30);
    return {
      data: shown.map((l) => ({
        fecha: new Date(l.createdAt).toLocaleString('es-AR', { timeZone: TZ }),
        usuario: l.staffName,
        accion: l.summary,
      })),
      summary: plural(shown.length, 'acción', 'acciones'),
    };
  },
});

// ─── Cambios (siempre a través de la API, con confirmación del usuario) ─────────

const guardarProducto = defineTool({
  name: 'guardar_producto',
  label: 'Guardar producto',
  kind: 'write',
  roles: ADMIN,
  description:
    'Crea un producto nuevo o modifica uno existente (descripción, precio de venta, costo sin IVA, IVA). Solo cambia los campos que mandes. Para crear uno nuevo hacen falta código, descripción y precio. Para el stock de un producto existente usá ajustar_stock; para cambiar el precio de muchos productos a la vez usá actualizar_precios.',
  schema: z.object({
    codigo: z.string().trim().min(1).describe('Código del producto (exacto).'),
    descripcion: z.string().trim().min(1).optional(),
    precio: z.number().nonnegative().optional().describe('Precio de venta final (con IVA) en pesos.'),
    costo: z.number().nonnegative().nullable().optional().describe('Costo SIN IVA en pesos, como viene en la lista del proveedor (null para borrarlo).'),
    iva: z.number().min(0).max(100).optional().describe('Alícuota de IVA en % (ej: 21 o 10.5).'),
    stockInicial: z.number().int().nonnegative().optional().describe('Solo al crear un producto nuevo.'),
  }),
  preview: async (input) => {
    const p = await getProduct(input.codigo);
    if (p && p.active) {
      const lines = [
        diff('Descripción', p.description, input.descripcion),
        diff('Precio', p.unitPrice, input.precio, fmtMoney),
        diff('Costo sin IVA', p.costPrice, input.costo, (v: number | null) => (v === null ? 'sin costo' : fmtMoney(v))),
        diff('IVA', p.ivaRate, input.iva, (v: number) => `${v}%`),
      ].filter((l): l is string => !!l);
      if (lines.length === 0) return { ok: false, error: `El producto ${p.code} ya tiene esos valores; no hay nada para cambiar.` };
      return {
        ok: true,
        title: `Modificar ${p.code} · ${p.description}`,
        details: lines,
        warning: input.stockInicial !== undefined ? 'El stock no se cambia acá (usá un ajuste de stock).' : undefined,
      };
    }
    if (!input.descripcion || input.precio === undefined) {
      return { ok: false, error: `No existe un producto activo con código ${input.codigo}. Para crearlo hacen falta descripción y precio.` };
    }
    return {
      ok: true,
      title: `${p ? 'Reactivar' : 'Crear'} producto ${input.codigo}`,
      details: [
        `Descripción: ${input.descripcion}`,
        `Precio: ${fmtMoney(input.precio)}`,
        ...(input.costo != null ? [`Costo sin IVA: ${fmtMoney(input.costo)}`] : []),
        `IVA: ${input.iva ?? 21}%`,
        `Stock inicial: ${input.stockInicial ?? 0}`,
      ],
      warning: p ? 'Ya existía dado de baja: se vuelve a activar con estos datos.' : undefined,
    };
  },
  run: async (input, ctx) => {
    const p = await getProduct(input.codigo);
    if (p && p.active) {
      await ctx.api.patch(`/catalog/${encodeURIComponent(p.code)}`, {
        description: input.descripcion,
        unitPrice: input.precio,
        costPrice: input.costo,
        ivaRate: input.iva,
      });
      return { data: { ok: true, codigo: p.code, accion: 'modificado' }, summary: `${p.code} actualizado` };
    }
    if (!input.descripcion || input.precio === undefined) throw new ToolError('Para crear un producto hacen falta descripción y precio.');
    await ctx.api.post('/catalog', {
      code: input.codigo,
      description: input.descripcion,
      unitPrice: input.precio,
      stock: input.stockInicial ?? 0,
      costPrice: input.costo ?? undefined,
      ivaRate: input.iva ?? 21,
    });
    return { data: { ok: true, codigo: input.codigo, accion: p ? 'reactivado' : 'creado' }, summary: `${input.codigo} ${p ? 'reactivado' : 'creado'}` };
  },
});

const stockAdjustments = z
  .array(
    z.object({
      codigo: z.string().trim().min(1),
      modo: z.enum(['sumar', 'fijar']).describe('"sumar" suma (o resta, con cantidad negativa) al stock actual; "fijar" lo reemplaza por un conteo.'),
      cantidad: z.number().int(),
    })
  )
  .min(1)
  .max(100);

async function resolveStockAdjustments(ajustes: z.infer<typeof stockAdjustments>) {
  const codes = [...new Set(ajustes.map((a) => a.codigo))];
  if (codes.length !== ajustes.length) throw new ToolError('Hay códigos repetidos: mandá un solo ajuste por producto.');
  const products = await findProducts({ codigos: codes }, null);
  const byCode = new Map(products.map((p) => [p.code, p]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new ToolError(`No existen productos activos con estos códigos: ${missing.join(', ')}.`);
  for (const a of ajustes) {
    if (a.modo === 'sumar' && a.cantidad === 0) throw new ToolError(`La cantidad a sumar para ${a.codigo} no puede ser 0.`);
    if (a.modo === 'fijar' && a.cantidad < 0) throw new ToolError(`El stock de ${a.codigo} no puede quedar negativo.`);
  }
  return ajustes.map((a) => {
    const p = byCode.get(a.codigo)!;
    const next = a.modo === 'sumar' ? p.stock + a.cantidad : a.cantidad;
    return { ...a, description: p.description, prev: p.stock, next };
  });
}

const ajustarStock = defineTool({
  name: 'ajustar_stock',
  label: 'Ajustar stock',
  kind: 'write',
  roles: ADMIN,
  description:
    'Ajusta el stock del depósito de uno o varios productos en una sola operación: "sumar" para ingresos de mercadería (o restar con cantidad negativa) y "fijar" para corregir con un conteo real.',
  schema: z.object({ ajustes: stockAdjustments }),
  preview: async (input) => {
    try {
      const rows = await resolveStockAdjustments(input.ajustes);
      const negative = rows.filter((r) => r.next < 0);
      return {
        ok: true,
        title: `Ajustar el stock de ${plural(rows.length, 'producto', 'productos')}`,
        details: rows.map(
          (r) => `${r.codigo} · ${r.description}: ${r.prev} → ${r.next} (${r.modo === 'sumar' ? `${r.cantidad > 0 ? '+' : ''}${r.cantidad}` : 'conteo'})`
        ),
        warning: negative.length ? `Quedarían con stock negativo: ${negative.map((r) => r.codigo).join(', ')}.` : undefined,
      };
    } catch (e) {
      if (e instanceof ToolError) return { ok: false, error: e.message };
      throw e;
    }
  },
  run: async (input, ctx) => {
    const rows = await resolveStockAdjustments(input.ajustes);
    const done: { codigo: string; stockAnterior: number; stockNuevo: number }[] = [];
    for (const r of rows) {
      try {
        const res = await ctx.api.patch<{ stock: number; prev: number }>(`/catalog/${encodeURIComponent(r.codigo)}/stock`, {
          mode: r.modo === 'sumar' ? 'add' : 'set',
          quantity: r.cantidad,
        });
        done.push({ codigo: r.codigo, stockAnterior: res.prev, stockNuevo: res.stock });
      } catch (e) {
        throw new ToolError(
          `Se ajustaron ${done.length} de ${rows.length} productos; falló ${r.codigo}: ${e instanceof Error ? e.message : e}. Ya aplicados: ${JSON.stringify(done)}`
        );
      }
    }
    return { data: { ok: true, ajustados: done }, summary: `Stock ajustado en ${plural(done.length, 'producto', 'productos')}` };
  },
});

const PRICE_MODE = { porcentaje: 'percent', sumar_monto: 'add', precio_fijo: 'set' } as const;
const ROUNDING = { ninguno: 'none', entero: 'unit', decena: 'ten', centena: 'hundred' } as const;

const actualizarPrecios = defineTool({
  name: 'actualizar_precios',
  label: 'Actualizar precios',
  kind: 'write',
  roles: ADMIN,
  description:
    'Cambia el precio de venta de muchos productos a la vez (lista de precios): aumento o descuento porcentual, sumar/restar un monto fijo o poner el mismo precio a todos. Los productos se eligen por palabras (texto) y/o códigos exactos. Para aplicarlo a TODO el catálogo hay que mandar todos=true. Muestra al usuario cuántos productos cambian y ejemplos antes de aplicar.',
  schema: z.object({
    ...productFilterSchema,
    todos: z.boolean().optional().describe('true para aplicar a todos los productos activos (solo si el usuario lo pidió explícitamente).'),
    tipo: z.enum(['porcentaje', 'sumar_monto', 'precio_fijo']),
    valor: z.number().describe('Porcentaje (10 = +10%, -5 = -5%), monto en pesos a sumar/restar, o el precio nuevo.'),
    redondeo: z.enum(['ninguno', 'entero', 'decena', 'centena']).optional().describe('Redondeo del precio final (por defecto "ninguno": centavos).'),
  }),
  preview: async (input) => {
    const hasFilter = !!input.texto?.trim() || !!input.codigos?.length;
    if (!hasFilter && !input.todos) {
      return { ok: false, error: 'Indicá qué productos cambiar (texto o códigos), o todos=true si el usuario pidió explícitamente todo el catálogo.' };
    }
    if (input.tipo === 'precio_fijo' && input.valor < 0) return { ok: false, error: 'El precio no puede ser negativo.' };
    if (input.tipo === 'porcentaje' && input.valor <= -100) return { ok: false, error: 'Un descuento de 100% o más dejaría los precios en cero.' };
    const rows = await findProducts({ texto: input.texto, codigos: input.codigos }, null);
    if (rows.length === 0) return { ok: false, error: 'Ningún producto activo coincide con ese filtro.' };
    const rounding = ROUNDING[input.redondeo ?? 'ninguno'];
    const mode = PRICE_MODE[input.tipo];
    const examples = rows.slice(0, 8).map((p) => `${p.code} · ${p.description}: ${fmtMoney(p.unitPrice)} → ${fmtMoney(applyPriceChange(p.unitPrice, mode, input.valor, rounding))}`);
    const how =
      input.tipo === 'porcentaje'
        ? `${input.valor > 0 ? 'Aumentar' : 'Bajar'} ${Math.abs(input.valor)}%`
        : input.tipo === 'sumar_monto'
          ? `${input.valor >= 0 ? 'Sumar' : 'Restar'} ${fmtMoney(Math.abs(input.valor))}`
          : `Poner precio ${fmtMoney(input.valor)}`;
    const big = (input.tipo === 'porcentaje' && Math.abs(input.valor) >= 50) || (!hasFilter && input.todos);
    return {
      ok: true,
      title: `${how} a ${plural(rows.length, 'producto', 'productos')}${!hasFilter ? ' (TODO el catálogo)' : ''}`,
      details: [...examples, ...(rows.length > examples.length ? [`… y ${rows.length - examples.length} más`] : []), ...(input.redondeo && input.redondeo !== 'ninguno' ? [`Redondeo: ${input.redondeo}`] : [])],
      warning: big ? 'Es un cambio grande: revisalo bien antes de confirmar.' : undefined,
    };
  },
  run: async (input, ctx) => {
    const rows = await findProducts({ texto: input.texto, codigos: input.codigos }, null);
    if (rows.length === 0) throw new ToolError('Ningún producto activo coincide con ese filtro.');
    const res = await ctx.api.post<{ updated: number }>('/catalog/bulk-price', {
      codes: rows.map((r) => r.code),
      mode: PRICE_MODE[input.tipo],
      value: input.valor,
      rounding: ROUNDING[input.redondeo ?? 'ninguno'],
    });
    return { data: { ok: true, productosActualizados: res.updated }, summary: `Precio actualizado en ${plural(res.updated, 'producto', 'productos')}` };
  },
});

const desactivarProducto = defineTool({
  name: 'desactivar_producto',
  label: 'Dar de baja producto',
  kind: 'write',
  roles: ADMIN,
  description: 'Da de baja un producto del catálogo (deja de aparecer; se puede reactivar volviéndolo a guardar).',
  schema: z.object({ codigo: z.string().trim().min(1) }),
  preview: async (input) => {
    const p = await getProduct(input.codigo);
    if (!p || !p.active) return { ok: false, error: `No existe un producto activo con código ${input.codigo}.` };
    return {
      ok: true,
      title: `Dar de baja ${p.code} · ${p.description}`,
      details: [`Precio ${fmtMoney(p.unitPrice)} · stock ${p.stock}`],
      warning: p.stock > 0 ? `Todavía tiene ${p.stock} unidades en stock.` : undefined,
    };
  },
  run: async (input, ctx) => {
    await ctx.api.del(`/catalog/${encodeURIComponent(input.codigo)}`);
    return { data: { ok: true }, summary: `${input.codigo} dado de baja` };
  },
});

const guardarCliente = defineTool({
  name: 'guardar_cliente',
  label: 'Guardar cliente',
  kind: 'write',
  roles: BOTH,
  description:
    'Crea un cliente nuevo (sin clienteId; hacen falta nombre y dirección) o modifica uno existente (con clienteId; solo cambian los campos enviados).',
  schema: z.object({
    clienteId: z.string().optional().describe('Id del cliente a modificar. Omitir para crear uno nuevo.'),
    nombre: z.string().trim().min(1).optional(),
    direccion: z.string().trim().min(1).optional().describe('Calle, número y localidad.'),
    telefono: z.string().trim().optional(),
    notas: z.string().trim().optional(),
    tipo: z.enum(['cliente', 'taller']).optional(),
  }),
  preview: async (input) => {
    if (input.clienteId) {
      const c = await getClient(input.clienteId);
      if (!c || !c.active) return { ok: false, error: `No existe un cliente activo con id ${input.clienteId}.` };
      const lines = [
        diff('Nombre', c.name, input.nombre),
        diff('Dirección', c.address, input.direccion),
        diff('Teléfono', c.phone, input.telefono),
        diff('Notas', c.notes, input.notas),
        diff('Tipo', c.type, input.tipo),
      ].filter((l): l is string => !!l);
      if (lines.length === 0) return { ok: false, error: 'El cliente ya tiene esos datos; no hay nada para cambiar.' };
      return { ok: true, title: `Modificar cliente ${c.name}`, details: lines };
    }
    if (!input.nombre || !input.direccion) return { ok: false, error: 'Para crear un cliente hacen falta nombre y dirección.' };
    const { rows: dup } = await pool.query(`select name, address from clients where active and lower(name) = lower($1) limit 1`, [input.nombre]);
    return {
      ok: true,
      title: `Crear cliente ${input.nombre}`,
      details: [
        `Dirección: ${input.direccion}`,
        ...(input.telefono ? [`Teléfono: ${input.telefono}`] : []),
        `Tipo: ${input.tipo ?? 'cliente'}`,
        ...(input.notas ? [`Notas: ${input.notas}`] : []),
      ],
      warning: dup[0] ? `Ya existe un cliente con ese nombre (${dup[0].address}).` : undefined,
    };
  },
  run: async (input, ctx) => {
    if (input.clienteId) {
      await requireActiveClient(input.clienteId);
      await ctx.api.patch(`/clients/${encodeURIComponent(input.clienteId)}`, {
        name: input.nombre,
        address: input.direccion,
        phone: input.telefono,
        notes: input.notas,
        type: input.tipo,
      });
      return { data: { ok: true, clienteId: input.clienteId }, summary: 'Cliente actualizado' };
    }
    if (!input.nombre || !input.direccion) throw new ToolError('Para crear un cliente hacen falta nombre y dirección.');
    const id = newId('cl');
    await ctx.api.post('/clients', {
      id,
      name: input.nombre,
      address: input.direccion,
      phone: input.telefono || undefined,
      notes: input.notas || undefined,
      type: input.tipo ?? 'cliente',
    });
    return { data: { ok: true, clienteId: id }, summary: `Cliente ${input.nombre} creado` };
  },
});

const desactivarCliente = defineTool({
  name: 'desactivar_cliente',
  label: 'Dar de baja cliente',
  kind: 'write',
  roles: ADMIN,
  description: 'Da de baja un cliente (deja de aparecer en las listas; su historial de ventas y cobros se conserva).',
  schema: z.object({ clienteId: z.string().min(1) }),
  preview: async (input) => {
    const c = await getClient(input.clienteId);
    if (!c || !c.active) return { ok: false, error: `No existe un cliente activo con id ${input.clienteId}.` };
    return {
      ok: true,
      title: `Dar de baja al cliente ${c.name}`,
      details: [c.address],
      warning: Math.abs(c.balance) > 0.005 ? `Tiene saldo de ${fmtMoney(c.balance)} en su cuenta corriente.` : undefined,
    };
  },
  run: async (input, ctx) => {
    await ctx.api.del(`/clients/${encodeURIComponent(input.clienteId)}`);
    return { data: { ok: true }, summary: 'Cliente dado de baja' };
  },
});

const guardarListaReparto = defineTool({
  name: 'guardar_lista_reparto',
  label: 'Guardar lista de reparto',
  kind: 'write',
  roles: ADMIN,
  description:
    'Crea una lista de reparto semanal (sin listaId; hace falta el nombre) o modifica una existente: nombre, días de la semana y repartidor asignado. Los clientes de la lista se cambian con modificar_clientes_lista.',
  schema: z.object({
    listaId: z.string().optional().describe('Id de la lista a modificar. Omitir para crear una nueva.'),
    nombre: z.string().trim().min(1).optional(),
    dias: z.array(z.number().int().min(0).max(6)).optional().describe('Días de la semana: 0=domingo, 1=lunes … 6=sábado.'),
    repartidorId: z.string().nullable().optional().describe('Id del repartidor asignado (null para quitarlo).'),
  }),
  preview: async (input) => {
    let courierName: string | null | undefined;
    if (input.repartidorId) {
      const s = await getStaff(input.repartidorId);
      if (!s || !s.active) return { ok: false, error: `No existe un usuario activo con id ${input.repartidorId}.` };
      courierName = s.name;
    } else if (input.repartidorId === null) courierName = null;
    const days = (d?: number[]) => (d && d.length ? d.map((x) => WEEKDAYS[x]).join(', ') : 'sin días');
    if (input.listaId) {
      const l = await getList(input.listaId);
      if (!l) return { ok: false, error: `No existe una lista con id ${input.listaId}.` };
      const lines = [
        diff('Nombre', l.name, input.nombre),
        input.dias ? diff('Días', days(l.weekdays), days(input.dias)) : null,
        diff('Repartidor', l.courierName ?? 'sin asignar', courierName === undefined ? undefined : courierName ?? 'sin asignar'),
      ].filter((x): x is string => !!x);
      if (lines.length === 0) return { ok: false, error: 'La lista ya tiene esos datos.' };
      return { ok: true, title: `Modificar la lista "${l.name}"`, details: lines };
    }
    if (!input.nombre) return { ok: false, error: 'Para crear una lista hace falta el nombre.' };
    return {
      ok: true,
      title: `Crear la lista de reparto "${input.nombre}"`,
      details: [`Días: ${days(input.dias)}`, `Repartidor: ${courierName ?? 'sin asignar'}`],
    };
  },
  run: async (input, ctx) => {
    let courierName: string | null = null;
    if (input.repartidorId) courierName = (await requireActiveStaff(input.repartidorId)).name;
    const courierPatch = input.repartidorId !== undefined ? { courierId: input.repartidorId, courierName } : {};
    if (input.listaId) {
      await ctx.api.patch(`/lists/${encodeURIComponent(input.listaId)}`, { name: input.nombre, weekdays: input.dias, ...courierPatch });
      return { data: { ok: true, listaId: input.listaId }, summary: 'Lista actualizada' };
    }
    if (!input.nombre) throw new ToolError('Para crear una lista hace falta el nombre.');
    const { id } = await ctx.api.post<{ id: string }>('/lists', { name: input.nombre, weekdays: input.dias ?? [] });
    if (input.repartidorId) await ctx.api.patch(`/lists/${encodeURIComponent(id)}`, courierPatch);
    return { data: { ok: true, listaId: id }, summary: `Lista "${input.nombre}" creada` };
  },
});

const modificarClientesLista = defineTool({
  name: 'modificar_clientes_lista',
  label: 'Modificar clientes de la lista',
  kind: 'write',
  roles: ADMIN,
  description: 'Agrega y/o quita clientes de una lista de reparto (los nuevos van al final del recorrido).',
  schema: z.object({
    listaId: z.string().min(1),
    agregar: z.array(z.string()).max(200).optional().describe('Ids de clientes a agregar.'),
    quitar: z.array(z.string()).max(200).optional().describe('Ids de clientes a quitar.'),
  }),
  preview: async (input) => {
    const l = await getList(input.listaId);
    if (!l) return { ok: false, error: `No existe una lista con id ${input.listaId}.` };
    const ids = [...(input.agregar ?? []), ...(input.quitar ?? [])];
    if (ids.length === 0) return { ok: false, error: 'Indicá clientes para agregar o quitar.' };
    const { rows } = await pool.query(`select id, name, active from clients where id = any($1::text[])`, [ids]);
    const byId = new Map(rows.map((r) => [r.id as string, r as { name: string; active: boolean }]));
    const missing = (input.agregar ?? []).filter((id) => !byId.get(id)?.active);
    if (missing.length) return { ok: false, error: `No existen clientes activos con estos ids: ${missing.join(', ')}.` };
    const name = (id: string) => byId.get(id)?.name ?? id;
    return {
      ok: true,
      title: `Cambiar los clientes de la lista "${l.name}"`,
      details: [...(input.agregar ?? []).map((id) => `+ ${name(id)}`), ...(input.quitar ?? []).map((id) => `− ${name(id)}`)],
    };
  },
  run: async (input, ctx) => {
    const lid = encodeURIComponent(input.listaId);
    for (const id of input.agregar ?? []) await ctx.api.post(`/lists/${lid}/clients`, { clientId: id });
    for (const id of input.quitar ?? []) await ctx.api.del(`/lists/${lid}/clients/${encodeURIComponent(id)}`);
    return {
      data: { ok: true, agregados: input.agregar?.length ?? 0, quitados: input.quitar?.length ?? 0 },
      summary: 'Lista actualizada',
    };
  },
});

const eliminarListaReparto = defineTool({
  name: 'eliminar_lista_reparto',
  label: 'Eliminar lista de reparto',
  kind: 'write',
  roles: ADMIN,
  description: 'Elimina una lista de reparto semanal (no borra a los clientes, solo la lista).',
  schema: z.object({ listaId: z.string().min(1) }),
  preview: async (input) => {
    const l = await getList(input.listaId);
    if (!l) return { ok: false, error: `No existe una lista con id ${input.listaId}.` };
    return { ok: true, title: `Eliminar la lista "${l.name}"`, details: [`Tiene ${plural(l.clientCount, 'cliente', 'clientes')}.`] };
  },
  run: async (input, ctx) => {
    await ctx.api.del(`/lists/${encodeURIComponent(input.listaId)}`);
    return { data: { ok: true }, summary: 'Lista eliminada' };
  },
});

const aplicarListaReparto = defineTool({
  name: 'aplicar_lista_reparto',
  label: 'Cargar lista en la ruta de hoy',
  kind: 'write',
  roles: ADMIN,
  description: 'Agrega los clientes de una lista de reparto a la ruta de hoy de su repartidor (los que ya estaban en la ruta no se duplican).',
  schema: z.object({ listaId: z.string().min(1) }),
  preview: async (input) => {
    const l = await getList(input.listaId);
    if (!l) return { ok: false, error: `No existe una lista con id ${input.listaId}.` };
    if (!l.courierId) return { ok: false, error: `La lista "${l.name}" no tiene repartidor asignado.` };
    if (l.clientCount === 0) return { ok: false, error: `La lista "${l.name}" no tiene clientes.` };
    return {
      ok: true,
      title: `Cargar la lista "${l.name}" en la ruta de hoy`,
      details: [`${plural(l.clientCount, 'cliente', 'clientes')} para ${l.courierName}`],
    };
  },
  run: async (input, ctx) => {
    const res = await ctx.api.post<{ added: number }>(`/lists/${encodeURIComponent(input.listaId)}/apply`);
    return { data: { ok: true, agregados: res.added }, summary: `${plural(res.added, 'parada agregada', 'paradas agregadas')}` };
  },
});

const guardarProveedor = defineTool({
  name: 'guardar_proveedor',
  label: 'Guardar proveedor',
  kind: 'write',
  roles: ADMIN,
  description: 'Crea un proveedor (sin proveedorId; hace falta el nombre) o modifica sus datos.',
  schema: z.object({
    proveedorId: z.string().optional(),
    nombre: z.string().trim().min(1).optional(),
    telefono: z.string().trim().optional(),
    notas: z.string().trim().optional(),
  }),
  preview: async (input) => {
    if (input.proveedorId) {
      const { rows } = await pool.query(`select name, phone, notes from suppliers where id = $1 and active`, [input.proveedorId]);
      const s = rows[0];
      if (!s) return { ok: false, error: `No existe un proveedor activo con id ${input.proveedorId}.` };
      const lines = [diff('Nombre', s.name, input.nombre), diff('Teléfono', s.phone, input.telefono), diff('Notas', s.notes, input.notas)].filter(
        (l): l is string => !!l
      );
      if (lines.length === 0) return { ok: false, error: 'El proveedor ya tiene esos datos.' };
      return { ok: true, title: `Modificar proveedor ${s.name}`, details: lines };
    }
    if (!input.nombre) return { ok: false, error: 'Para crear un proveedor hace falta el nombre.' };
    return { ok: true, title: `Crear proveedor ${input.nombre}`, details: [input.telefono ? `Teléfono: ${input.telefono}` : 'Sin teléfono'] };
  },
  run: async (input, ctx) => {
    if (input.proveedorId) {
      const { rows } = await pool.query(`select name, phone, notes from suppliers where id = $1 and active`, [input.proveedorId]);
      if (!rows[0]) throw new ToolError(`No existe un proveedor activo con id ${input.proveedorId}.`);
      await ctx.api.post('/suppliers', {
        id: input.proveedorId,
        name: input.nombre ?? rows[0].name,
        phone: input.telefono ?? rows[0].phone ?? undefined,
        notes: input.notas ?? rows[0].notes ?? undefined,
      });
      return { data: { ok: true, proveedorId: input.proveedorId }, summary: 'Proveedor actualizado' };
    }
    if (!input.nombre) throw new ToolError('Para crear un proveedor hace falta el nombre.');
    const id = newId('sup');
    await ctx.api.post('/suppliers', { id, name: input.nombre, phone: input.telefono || undefined, notes: input.notas || undefined });
    return { data: { ok: true, proveedorId: id }, summary: `Proveedor ${input.nombre} creado` };
  },
});

const cargarDeudaProveedor = defineTool({
  name: 'cargar_deuda_proveedor',
  label: 'Cargar deuda con proveedor',
  kind: 'write',
  roles: ADMIN,
  description: 'Registra una factura/deuda pendiente con un proveedor.',
  schema: z.object({
    proveedorId: z.string().min(1),
    monto: z.number().positive(),
    factura: z.string().trim().optional().describe('Número de factura.'),
    fechaEmision: dateField.optional(),
    vencimiento: dateField.optional(),
    notas: z.string().trim().optional(),
  }),
  preview: async (input) => {
    const { rows } = await pool.query(`select name from suppliers where id = $1 and active`, [input.proveedorId]);
    if (!rows[0]) return { ok: false, error: `No existe un proveedor activo con id ${input.proveedorId}.` };
    return {
      ok: true,
      title: `Cargar deuda de ${fmtMoney(input.monto)} con ${rows[0].name}`,
      details: [
        ...(input.factura ? [`Factura ${input.factura}`] : []),
        ...(input.fechaEmision ? [`Emitida el ${input.fechaEmision}`] : []),
        ...(input.vencimiento ? [`Vence el ${input.vencimiento}`] : []),
        ...(input.notas ? [input.notas] : []),
      ],
    };
  },
  run: async (input, ctx) => {
    const { rows } = await pool.query(`select name from suppliers where id = $1 and active`, [input.proveedorId]);
    if (!rows[0]) throw new ToolError(`No existe un proveedor activo con id ${input.proveedorId}.`);
    const res = await ctx.api.post<{ id: string }>('/supplier-debts', {
      supplierId: input.proveedorId,
      supplierName: rows[0].name,
      invoiceNumber: input.factura,
      amount: input.monto,
      issueDate: input.fechaEmision,
      dueDate: input.vencimiento,
      notes: input.notas,
    });
    return { data: { ok: true, deudaId: res.id }, summary: 'Deuda cargada' };
  },
});

const marcarDeudaPagada = defineTool({
  name: 'marcar_deuda_pagada',
  label: 'Marcar deuda pagada',
  kind: 'write',
  roles: ADMIN,
  description: 'Marca como pagada una deuda con un proveedor, indicando el medio de pago (para ECHEQ hace falta el número).',
  schema: z.object({
    deudaId: z.string().min(1),
    medioPago: z.enum(['efectivo', 'transferencia', 'cheque', 'echeq', 'otro']),
    numeroEcheq: z.string().trim().optional(),
    fechaEcheq: dateField.optional(),
  }),
  preview: async (input) => {
    const { rows } = await pool.query(`select supplier_name, invoice_number, amount, status from supplier_debts where id = $1`, [input.deudaId]);
    const d = rows[0];
    if (!d) return { ok: false, error: `No existe una deuda con id ${input.deudaId}.` };
    if (d.status === 'pagado') return { ok: false, error: 'Esa deuda ya figura como pagada.' };
    if (input.medioPago === 'echeq' && !input.numeroEcheq) return { ok: false, error: 'Para ECHEQ hace falta el número.' };
    return {
      ok: true,
      title: `Marcar como pagada la deuda de ${fmtMoney(Number(d.amount))} con ${d.supplier_name}`,
      details: [
        ...(d.invoice_number ? [`Factura ${d.invoice_number}`] : []),
        `Pago: ${input.medioPago}${input.numeroEcheq ? ` #${input.numeroEcheq}` : ''}${input.fechaEcheq ? ` (${input.fechaEcheq})` : ''}`,
      ],
    };
  },
  run: async (input, ctx) => {
    await ctx.api.patch(`/supplier-debts/${encodeURIComponent(input.deudaId)}/pay`, {
      paymentMethod: input.medioPago,
      echeqNumber: input.numeroEcheq,
      echeqDate: input.fechaEcheq,
    });
    return { data: { ok: true }, summary: 'Deuda marcada como pagada' };
  },
});

const VAN_KIND = { carga: 'Cargar a la camioneta', devolucion: 'Devolver al depósito', muestra: 'Dar de baja como muestra' } as const;

const moverCamioneta = defineTool({
  name: 'mover_camioneta',
  label: 'Mover mercadería de la camioneta',
  kind: 'write',
  roles: ADMIN,
  description:
    'Movimiento de mercadería de la camioneta: "carga" (sale del stock del depósito y sube a la camioneta), "devolucion" (vuelve al depósito) o "muestra" (se da de baja desde la camioneta).',
  schema: z.object({
    codigo: z.string().trim().min(1),
    cantidad: z.number().int().positive(),
    tipo: z.enum(['carga', 'devolucion', 'muestra']),
    repartidorId: z.string().optional().describe('Repartidor que se lleva o devuelve la mercadería (opcional).'),
    notas: z.string().trim().optional(),
  }),
  preview: async (input) => {
    const p = await getProduct(input.codigo);
    if (!p || !p.active) return { ok: false, error: `No existe un producto activo con código ${input.codigo}.` };
    const { rows } = await pool.query(`select quantity from van_stock where code = $1`, [p.code]);
    const inVan = Number(rows[0]?.quantity ?? 0);
    if (input.tipo !== 'carga' && inVan < input.cantidad) return { ok: false, error: `En la camioneta hay solo ${inVan} u. de ${p.code}.` };
    let courier: string | undefined;
    if (input.repartidorId) {
      const s = await getStaff(input.repartidorId);
      if (!s) return { ok: false, error: `No existe un usuario con id ${input.repartidorId}.` };
      courier = s.name;
    }
    return {
      ok: true,
      title: `${VAN_KIND[input.tipo]}: ${input.cantidad} u. de ${p.code} · ${p.description}`,
      details: [
        `Depósito: ${p.stock} → ${input.tipo === 'carga' ? p.stock - input.cantidad : input.tipo === 'devolucion' ? p.stock + input.cantidad : p.stock}`,
        `Camioneta: ${inVan} → ${input.tipo === 'carga' ? inVan + input.cantidad : inVan - input.cantidad}`,
        ...(courier ? [`Repartidor: ${courier}`] : []),
        ...(input.notas ? [input.notas] : []),
      ],
      warning: input.tipo === 'carga' && p.stock < input.cantidad ? `En el depósito hay solo ${p.stock} u.: el stock quedaría negativo.` : undefined,
    };
  },
  run: async (input, ctx) => {
    await ctx.api.post('/van/move', {
      code: input.codigo,
      quantity: input.cantidad,
      kind: input.tipo,
      courierId: input.repartidorId,
      notes: input.notas,
    });
    return { data: { ok: true }, summary: 'Movimiento registrado' };
  },
});

const saleSchema = z.object({
  clienteId: z.string().min(1),
  repartidorId: z.string().optional().describe('Vendedor/repartidor al que se asigna la venta (obligatorio para administradores; un repartidor siempre carga a su nombre).'),
  items: z
    .array(
      z.object({
        codigo: z.string().trim().min(1),
        cantidad: z.number().int().positive(),
        precioUnitario: z.number().nonnegative().optional().describe('Solo si se vende a un precio distinto al de lista.'),
      })
    )
    .min(1)
    .max(50),
  descripcion: z.string().trim().optional(),
  cuotas: z
    .object({
      cantidad: z.number().int().min(2).max(60),
      primerVencimiento: dateField,
      frecuencia: z.enum(['semanal', 'mensual']),
    })
    .optional()
    .describe('Solo si la venta se cobra en cuotas.'),
});

async function resolveSale(input: z.infer<typeof saleSchema>, ctx: ToolContext) {
  const client = await requireActiveClient(input.clienteId);
  let courier: { id: string; name: string };
  if (isRepartidor(ctx)) courier = { id: ctx.user.sub, name: ctx.user.name };
  else {
    if (!input.repartidorId) throw new ToolError('Indicá a qué vendedor/repartidor se asigna la venta (repartidorId).');
    courier = await requireActiveStaff(input.repartidorId);
  }
  const codes = [...new Set(input.items.map((i) => i.codigo))];
  const products = await findProducts({ codigos: codes }, null);
  const byCode = new Map(products.map((p) => [p.code, p]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new ToolError(`No existen productos activos con estos códigos: ${missing.join(', ')}.`);
  const items = input.items.map((i) => {
    const p = byCode.get(i.codigo)!;
    const unitPrice = i.precioUnitario ?? p.unitPrice;
    return { code: p.code, description: p.description, quantity: i.cantidad, unitPrice, subtotal: round2(unitPrice * i.cantidad), stock: p.stock, listPrice: p.unitPrice };
  });
  const total = round2(items.reduce((s, i) => s + i.subtotal, 0));
  return { client, courier, items, total };
}

const cargarVenta = defineTool({
  name: 'cargar_venta',
  label: 'Cargar venta',
  kind: 'write',
  roles: BOTH,
  description:
    'Carga una venta a la cuenta corriente de un cliente con productos del catálogo (descuenta stock y suma al saldo del cliente). Puede ser en cuotas semanales o mensuales.',
  schema: saleSchema,
  preview: async (input, ctx) => {
    try {
      const s = await resolveSale(input, ctx);
      const lowStock = s.items.filter((i) => i.quantity > i.stock);
      return {
        ok: true,
        title: `Venta de ${fmtMoney(s.total)} a ${s.client.name}`,
        details: [
          ...s.items.map(
            (i) => `${i.quantity} x ${i.code} · ${i.description} a ${fmtMoney(i.unitPrice)}${i.unitPrice !== i.listPrice ? ` (lista ${fmtMoney(i.listPrice)})` : ''} = ${fmtMoney(i.subtotal)}`
          ),
          `Vendedor: ${s.courier.name}`,
          ...(input.cuotas
            ? [`${input.cuotas.cantidad} cuotas ${input.cuotas.frecuencia === 'semanal' ? 'semanales' : 'mensuales'} desde el ${input.cuotas.primerVencimiento}`]
            : []),
          ...(input.descripcion ? [input.descripcion] : []),
        ],
        warning: lowStock.length ? `Sin stock suficiente: ${lowStock.map((i) => `${i.code} (hay ${i.stock})`).join(', ')}.` : undefined,
      };
    } catch (e) {
      if (e instanceof ToolError) return { ok: false, error: e.message };
      throw e;
    }
  },
  run: async (input, ctx) => {
    const s = await resolveSale(input, ctx);
    await ctx.api.post('/sales', {
      clientId: s.client.id,
      clientName: s.client.name,
      courierId: s.courier.id,
      courierName: s.courier.name,
      description: input.descripcion,
      items: s.items.map((i) => ({ code: i.code, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
      installments: input.cuotas
        ? { count: input.cuotas.cantidad, firstDueDate: input.cuotas.primerVencimiento, frequency: input.cuotas.frecuencia }
        : undefined,
    });
    return { data: { ok: true, total: s.total }, summary: `Venta de ${fmtMoney(s.total)} cargada` };
  },
});

const paymentSchema = z.object({
  clienteId: z.string().min(1),
  monto: z.number().positive(),
  medio: z.enum(['efectivo', 'transferencia', 'cheque', 'otro']),
  cuotaId: z.string().optional().describe('Id de la cuota a la que se aplica el cobro (ver ver_cuenta_cliente). Sin cuota es un pago general que no baja atrasos.'),
  numeroCheque: z.string().trim().optional(),
  banco: z.string().trim().optional(),
  notas: z.string().trim().optional(),
  repartidorId: z.string().optional().describe('Quién cobró (solo administradores; por defecto el usuario actual).'),
});

async function resolvePayment(input: z.infer<typeof paymentSchema>, ctx: ToolContext) {
  const client = await requireActiveClient(input.clienteId);
  let courier: { id: string; name: string } = { id: ctx.user.sub, name: ctx.user.name };
  if (!isRepartidor(ctx) && input.repartidorId) courier = await requireActiveStaff(input.repartidorId);
  let installment: { number: number; total: number; remaining: number } | null = null;
  if (input.cuotaId) {
    const { rows } = await pool.query(
      `select si.number, coalesce(s.installments_total, si.number) as total, s.client_id as "clientId",
         si.amount - coalesce((select sum(amount) from payments where installment_id = si.id), 0) as remaining
       from sale_installments si join sales s on s.id = si.sale_id where si.id = $1`,
      [input.cuotaId]
    );
    const r = rows[0];
    if (!r || (r.clientId && r.clientId !== client.id)) throw new ToolError('Esa cuota no existe o no es de este cliente. Revisá ver_cuenta_cliente.');
    installment = { number: Number(r.number), total: Number(r.total), remaining: round2(Number(r.remaining)) };
  }
  return { client, courier, installment };
}

const registrarCobro = defineTool({
  name: 'registrar_cobro',
  label: 'Registrar cobro',
  kind: 'write',
  roles: BOTH,
  description:
    'Registra un cobro a un cliente (baja su saldo). Si el cobro corresponde a una cuota, mandá su cuotaId para que cuente para el objetivo y baje el atraso.',
  schema: paymentSchema,
  preview: async (input, ctx) => {
    try {
      const p = await resolvePayment(input, ctx);
      const warn: string[] = [];
      if (p.installment && input.monto > p.installment.remaining + 0.005) warn.push(`La cuota tiene pendiente solo ${fmtMoney(p.installment.remaining)}.`);
      if (input.monto > p.client.balance + 0.005) warn.push(`El cliente debe ${fmtMoney(p.client.balance)}: quedaría con saldo a favor.`);
      return {
        ok: true,
        title: `Cobro de ${fmtMoney(input.monto)} a ${p.client.name} (${input.medio})`,
        details: [
          `Saldo: ${fmtMoney(p.client.balance)} → ${fmtMoney(p.client.balance - input.monto)}`,
          p.installment ? `Aplicado a la cuota ${p.installment.number}/${p.installment.total}` : 'Pago general (no se aplica a ninguna cuota)',
          ...(input.numeroCheque ? [`Cheque ${input.numeroCheque}${input.banco ? ` · ${input.banco}` : ''}`] : []),
          `Cobró: ${p.courier.name}`,
          ...(input.notas ? [input.notas] : []),
        ],
        warning: warn.length ? warn.join(' ') : undefined,
      };
    } catch (e) {
      if (e instanceof ToolError) return { ok: false, error: e.message };
      throw e;
    }
  },
  run: async (input, ctx) => {
    const p = await resolvePayment(input, ctx);
    await ctx.api.post('/payments', {
      clientId: p.client.id,
      clientName: p.client.name,
      courierId: p.courier.id,
      courierName: p.courier.name,
      amount: input.monto,
      method: input.medio,
      checkNumber: input.numeroCheque,
      bank: input.banco,
      notes: input.notas,
      installmentId: input.cuotaId,
    });
    return { data: { ok: true }, summary: `Cobro de ${fmtMoney(input.monto)} registrado` };
  },
});

// ─── Registro ─────────────────────────────────────────────────────────────────

// El orden es fijo: la lista de herramientas forma parte del prefijo de cada conversación.
export const AI_TOOLS: AiTool[] = [
  buscarProductos,
  buscarClientes,
  verCuentaCliente,
  consultarVentas,
  consultarCobros,
  verAtrasados,
  verObjetivos,
  resumenNegocio,
  verEquipo,
  verListasReparto,
  verProveedores,
  verCamioneta,
  verActividad,
  guardarProducto,
  ajustarStock,
  actualizarPrecios,
  desactivarProducto,
  guardarCliente,
  desactivarCliente,
  guardarListaReparto,
  modificarClientesLista,
  eliminarListaReparto,
  aplicarListaReparto,
  guardarProveedor,
  cargarDeudaProveedor,
  marcarDeudaPagada,
  moverCamioneta,
  cargarVenta,
  registrarCobro,
];

const byName = new Map(AI_TOOLS.map((t) => [t.name, t]));

export function toolsForRole(role: StaffRole): AiTool[] {
  return AI_TOOLS.filter((t) => t.roles.includes(role));
}

export function findTool(name: string, role: StaffRole): AiTool | undefined {
  const t = byName.get(name);
  return t && t.roles.includes(role) ? t : undefined;
}

export function toolLabel(name: string): string {
  return byName.get(name)?.label ?? name;
}

function inputSchemaOf(schema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Beta.BetaTool.InputSchema;
}

/** Definiciones para la API. Se streamea la respuesta, así que cada herramienta usa `eager_input_streaming`. */
export function anthropicTools(role: StaffRole): Anthropic.Beta.BetaTool[] {
  return toolsForRole(role).map((t) => ({
    name: t.name,
    description: t.kind === 'write' ? `${t.description} (Cambia datos: puede requerir que el usuario lo confirme.)` : t.description,
    input_schema: inputSchemaOf(t.schema),
    eager_input_streaming: true,
  }));
}
