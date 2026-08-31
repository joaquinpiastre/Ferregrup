import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const listsRouter = Router();

listsRouter.get('/lists', requireAuth, requireRole('admin', 'superadmin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select l.id, l.name, l.weekdays, l.courier_id as "courierId", l.courier_name as "courierName",
       count(lc.client_id)::int as "clientCount"
     from delivery_lists l
     left join delivery_list_clients lc on lc.list_id = l.id
     group by l.id order by l.name`
  );
  res.json({ lists: rows });
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
});

listsRouter.post('/lists', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const id = `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(`insert into delivery_lists (id, name, weekdays) values ($1,$2,$3)`, [
    id,
    parsed.data.name,
    parsed.data.weekdays,
  ]);
  res.json({ id });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  courierId: z.string().nullable().optional(),
  courierName: z.string().nullable().optional(),
});

listsRouter.patch('/lists/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { rows } = await pool.query(`select * from delivery_lists where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  const prev = rows[0];
  const p = parsed.data;
  await pool.query(
    `update delivery_lists set name = $2, weekdays = $3, courier_id = $4, courier_name = $5 where id = $1`,
    [
      req.params.id,
      p.name ?? prev.name,
      p.weekdays ?? prev.weekdays,
      p.courierId !== undefined ? p.courierId : prev.courier_id,
      p.courierName !== undefined ? p.courierName : prev.courier_name,
    ]
  );
  res.json({ ok: true });
});

listsRouter.delete('/lists/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const del = await pool.query(`delete from delivery_lists where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json({ ok: true });
});

listsRouter.get('/lists/:id/clients', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows } = await pool.query(
    `select c.id, c.name, c.address, lc.order_num as "orderNum"
     from delivery_list_clients lc
     join clients c on c.id = lc.client_id
     where lc.list_id = $1 order by lc.order_num`,
    [req.params.id]
  );
  res.json({ clients: rows });
});

const addClientSchema = z.object({ clientId: z.string().min(1) });

listsRouter.post('/lists/:id/clients', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = addClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const max = await pool.query(`select coalesce(max(order_num), 0) as max from delivery_list_clients where list_id = $1`, [req.params.id]);
  await pool.query(
    `insert into delivery_list_clients (list_id, client_id, order_num) values ($1,$2,$3)
     on conflict (list_id, client_id) do nothing`,
    [req.params.id, parsed.data.clientId, Number(max.rows[0].max) + 1]
  );
  res.json({ ok: true });
});

listsRouter.delete('/lists/:id/clients/:clientId', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  await pool.query(`delete from delivery_list_clients where list_id = $1 and client_id = $2`, [req.params.id, req.params.clientId]);
  res.json({ ok: true });
});

listsRouter.post('/lists/:id/apply', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const list = await pool.query(`select * from delivery_lists where id = $1`, [req.params.id]);
  if (list.rows.length === 0) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  const l = list.rows[0];
  if (!l.courier_id) {
    res.status(400).json({ error: 'La lista no tiene un repartidor asignado.' });
    return;
  }
  const clients = await pool.query(
    `select c.id, c.name, c.address from delivery_list_clients lc
     join clients c on c.id = lc.client_id where lc.list_id = $1 order by lc.order_num`,
    [req.params.id]
  );
  if (clients.rows.length === 0) {
    res.status(400).json({ error: 'La lista no tiene clientes.' });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query(
      `select coalesce(max(order_num), 0) as max from route_stops where courier_id = $1 and scheduled_date = $2`,
      [l.courier_id, today]
    );
    let order = Number(existing.rows[0].max);
    let added = 0;
    for (const c of clients.rows) {
      const dup = await client.query(
        `select 1 from route_stops where courier_id = $1 and scheduled_date = $2 and client_id = $3`,
        [l.courier_id, today, c.id]
      );
      if (dup.rows.length > 0) continue;
      order += 1;
      added += 1;
      await client.query(
        `insert into route_stops (id, courier_id, courier_name, client_id, client_name, client_address, order_num, scheduled_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [`rs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, l.courier_id, l.courier_name, c.id, c.name, c.address, order, today]
      );
    }
    await client.query('commit');
    res.json({ ok: true, added });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
});
