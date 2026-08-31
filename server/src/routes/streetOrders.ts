import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const streetOrdersRouter = Router();

const itemSchema = z.object({
  code: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number(),
  subtotal: z.number(),
});

const orderSchema = z.object({
  id: z.string().min(3),
  streetKey: z.string().min(1),
  streetLabel: z.string().min(1),
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  items: z.array(itemSchema).min(1),
  total: z.number(),
  notes: z.string().optional(),
  nearbyClients: z.array(z.object({ name: z.string(), address: z.string() })).default([]),
  clientName: z.string().optional(),
  status: z.enum(['pendiente', 'visto', 'nota', 'armado', 'retirado', 'cancelado']).default('pendiente'),
  createdAt: z.number().int().positive(),
});

const statusSchema = z.object({
  status: z.enum(['pendiente', 'visto', 'nota', 'armado', 'retirado', 'cancelado']),
  note: z.string().optional(),
});

const notesSchema = z.object({ notes: z.string() });

streetOrdersRouter.get('/street-orders', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `select
       o.id,
       o.street_key as "streetKey",
       o.street_label as "streetLabel",
       o.courier_id as "courierId",
       o.courier_name as "courierName",
       o.total,
       o.notes,
       o.nearby_clients as "nearbyClients",
       o.client_name as "clientName",
       o.status,
       o.created_at_ms as "createdAt",
       coalesce(
         json_agg(
           json_build_object(
             'code', i.code,
             'description', i.description,
             'quantity', i.quantity,
             'unitPrice', i.unit_price,
             'subtotal', i.subtotal
           )
         ) filter (where i.id is not null),
         '[]'::json
       ) as items
     from street_orders o
     left join street_order_items i on i.order_id = o.id
     group by o.id
     order by o.created_at_ms desc`
  );
  res.json({
    orders: rows.map((r) => ({ ...r, createdAt: Number(r.createdAt), total: Number(r.total) })),
  });
});

streetOrdersRouter.post('/street-orders', requireAuth, async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const o = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into street_orders
       (id, street_key, street_label, courier_id, courier_name, total, notes, nearby_clients, client_name, status, created_at_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       on conflict (id) do nothing`,
      [
        o.id,
        o.streetKey,
        o.streetLabel,
        o.courierId,
        o.courierName,
        o.total,
        o.notes ?? null,
        JSON.stringify(o.nearbyClients),
        o.clientName ?? null,
        o.status,
        o.createdAt,
      ]
    );
    for (const item of o.items) {
      await client.query(
        `insert into street_order_items (order_id, code, description, quantity, unit_price, subtotal)
         values ($1,$2,$3,$4,$5,$6)`,
        [o.id, item.code ?? null, item.description, item.quantity, item.unitPrice, item.subtotal]
      );
    }
    await client.query('commit');
    res.json({ ok: true });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
});

streetOrdersRouter.patch('/street-orders/:id/status', requireAuth, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const { status, note } = parsed.data;
  if (note) {
    await pool.query(
      `update street_orders set status = $2, notes = coalesce(notes || ' | ' || $3, $3) where id = $1`,
      [req.params.id, status, note]
    );
  } else {
    await pool.query(`update street_orders set status = $2 where id = $1`, [req.params.id, status]);
  }
  res.json({ ok: true });
});

streetOrdersRouter.patch('/street-orders/:id/notes', requireAuth, async (req, res) => {
  const parsed = notesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  await pool.query(`update street_orders set notes = $2 where id = $1`, [
    req.params.id,
    parsed.data.notes || null,
  ]);
  res.json({ ok: true });
});

streetOrdersRouter.delete('/street-orders/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const del = await pool.query(`delete from street_orders where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Pedido no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
