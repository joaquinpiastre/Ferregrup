import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const clientsRouter = Router();

clientsRouter.get('/clients', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, address, phone, notes, type, active
     from clients where active = true order by name`
  );
  res.json({ clients: rows });
});

// ─── Cuentas: saldo de todos los clientes (ventas cargadas - cobros) ───────────

clientsRouter.get('/clients/accounts', requireAuth, requireRole('admin', 'repartidor'), async (_req, res) => {
  const { rows } = await pool.query(`
    select c.id, c.name, c.address, c.phone, c.type,
      coalesce(s.total, 0) as charged,
      coalesce(p.total, 0) as paid
    from clients c
    left join (select client_id, sum(amount) as total from sales where client_id is not null group by client_id) s on s.client_id = c.id
    left join (select client_id, sum(amount) as total from payments where client_id is not null group by client_id) p on p.client_id = c.id
    where c.active = true
    order by c.name
  `);
  res.json({
    accounts: rows.map((r) => ({
      ...r,
      charged: Number(r.charged),
      paid: Number(r.paid),
      balance: Number(r.charged) - Number(r.paid),
    })),
  });
});

// ─── Saldo de un cliente puntual (lo puede ver cualquier usuario autenticado,
// incluido el repartidor antes de cobrarle) ─────────────────────────────────

clientsRouter.get('/clients/:id/balance', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select
       coalesce((select sum(amount) from sales where client_id = $1), 0) as charged,
       coalesce((select sum(amount) from payments where client_id = $1), 0) as paid`,
    [req.params.id]
  );
  const charged = Number(rows[0].charged);
  const paid = Number(rows[0].paid);
  res.json({ charged, paid, balance: charged - paid });
});

// ─── Detalle de cuenta: ventas y cobros de un cliente ───────────────────────────

clientsRouter.get('/clients/:id/statement', requireAuth, requireRole('admin'), async (req, res) => {
  const [{ rows: sales }, { rows: payments }] = await Promise.all([
    pool.query(
      `select id, amount, description, courier_name as "courierName", created_at_ms as "createdAt"
       from sales where client_id = $1 order by created_at_ms desc`,
      [req.params.id]
    ),
    pool.query(
      `select id, amount, method, courier_name as "courierName", created_at_ms as "createdAt"
       from payments where client_id = $1 order by created_at_ms desc`,
      [req.params.id]
    ),
  ]);
  res.json({
    sales: sales.map((r) => ({ ...r, amount: Number(r.amount) })),
    payments: payments.map((r) => ({ ...r, amount: Number(r.amount) })),
  });
});

const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['cliente', 'taller']).default('cliente'),
});

clientsRouter.post('/clients', requireAuth, async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const c = parsed.data;
  await pool.query(
    `insert into clients (id, name, address, phone, notes, type)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do update set
       name = excluded.name, address = excluded.address, phone = excluded.phone,
       notes = excluded.notes, type = excluded.type`,
    [c.id, c.name, c.address, c.phone ?? null, c.notes ?? null, c.type]
  );
  await logActivity(req.user!, 'client.create', `Creó/actualizó el cliente ${c.name}`);
  res.json({ ok: true });
});

const clientUpdateSchema = clientSchema.omit({ id: true }).partial();

clientsRouter.patch('/clients/:id', requireAuth, async (req, res) => {
  const parsed = clientUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const c = parsed.data;
  const { rows } = await pool.query(`select * from clients where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  const prev = rows[0];
  await pool.query(
    `update clients set name=$2, address=$3, phone=$4, notes=$5, type=$6 where id=$1`,
    [
      req.params.id,
      c.name ?? prev.name,
      c.address ?? prev.address,
      c.phone ?? prev.phone,
      c.notes ?? prev.notes,
      c.type ?? prev.type,
    ]
  );
  await logActivity(req.user!, 'client.update', `Editó el cliente ${c.name ?? prev.name}`);
  res.json({ ok: true });
});

clientsRouter.delete('/clients/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const prev = await pool.query(`select name from clients where id = $1`, [req.params.id]);
  const del = await pool.query(`update clients set active = false where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  await logActivity(req.user!, 'client.delete', `Eliminó el cliente ${prev.rows[0]?.name ?? req.params.id}`);
  res.json({ ok: true });
});
