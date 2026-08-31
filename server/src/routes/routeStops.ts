import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const routeStopsRouter = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

routeStopsRouter.get('/route-stops', requireAuth, async (req, res) => {
  const date = dateSchema.safeParse(req.query.date);
  if (!date.success) {
    res.status(400).json({ error: 'Falta el parámetro date (YYYY-MM-DD).' });
    return;
  }
  const isRepartidor = req.user?.role === 'repartidor';
  const courierId = isRepartidor ? req.user!.sub : (req.query.courierId as string | undefined);
  const { rows } = await pool.query(
    courierId
      ? `select id, courier_id as "courierId", courier_name as "courierName", client_id as "clientId",
           client_name as "clientName", client_address as "clientAddress", order_num as "orderNum",
           status, admin_notes as "adminNotes", courier_notes as "courierNotes",
           scheduled_date::text as "scheduledDate", arrived_at_ms as "arrivedAt", left_at_ms as "leftAt"
         from route_stops where scheduled_date = $1 and courier_id = $2 order by order_num`
      : `select id, courier_id as "courierId", courier_name as "courierName", client_id as "clientId",
           client_name as "clientName", client_address as "clientAddress", order_num as "orderNum",
           status, admin_notes as "adminNotes", courier_notes as "courierNotes",
           scheduled_date::text as "scheduledDate", arrived_at_ms as "arrivedAt", left_at_ms as "leftAt"
         from route_stops where scheduled_date = $1 order by courier_id, order_num`,
    courierId ? [date.data, courierId] : [date.data]
  );
  res.json({
    stops: rows.map((r) => ({
      ...r,
      arrivedAt: r.arrivedAt !== null ? Number(r.arrivedAt) : undefined,
      leftAt: r.leftAt !== null ? Number(r.leftAt) : undefined,
    })),
  });
});

const bulkSchema = z.object({
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  scheduledDate: dateSchema,
  clients: z.array(z.object({ id: z.string(), name: z.string(), address: z.string() })).min(1),
});

routeStopsRouter.post('/route-stops/bulk', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { courierId, courierName, scheduledDate, clients } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query(
      `select coalesce(max(order_num), 0) as max from route_stops where courier_id = $1 and scheduled_date = $2`,
      [courierId, scheduledDate]
    );
    let order = Number(existing.rows[0].max);
    for (const c of clients) {
      order += 1;
      await client.query(
        `insert into route_stops (id, courier_id, courier_name, client_id, client_name, client_address, order_num, scheduled_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [`rs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, courierId, courierName, c.id, c.name, c.address, order, scheduledDate]
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

const statusSchema = z.object({
  status: z.enum(['pendiente', 'en_camino', 'entregado', 'problema']),
  courierNotes: z.string().optional(),
});

routeStopsRouter.patch('/route-stops/:id/status', requireAuth, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { rows } = await pool.query(`select courier_id as "courierId" from route_stops where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Parada no encontrada.' });
    return;
  }
  if (req.user?.role === 'repartidor' && rows[0].courierId !== req.user.sub) {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  const { status, courierNotes } = parsed.data;
  const nowMs = Date.now();
  const arrivedSet = status === 'en_camino' ? nowMs : null;
  const leftSet = status === 'entregado' || status === 'problema' ? nowMs : null;
  await pool.query(
    `update route_stops set
       status = $2,
       courier_notes = coalesce($3, courier_notes),
       arrived_at_ms = coalesce(arrived_at_ms, $4),
       left_at_ms = coalesce($5, left_at_ms)
     where id = $1`,
    [req.params.id, status, courierNotes ?? null, arrivedSet, leftSet]
  );
  res.json({ ok: true });
});

const orderSchema = z.object({ direction: z.enum(['up', 'down']) });

routeStopsRouter.patch('/route-stops/:id/reorder', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { rows } = await pool.query(
    `select id, courier_id as "courierId", scheduled_date as "scheduledDate", order_num as "orderNum" from route_stops where id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Parada no encontrada.' });
    return;
  }
  const current = rows[0];
  const cmp = parsed.data.direction === 'up' ? '<' : '>';
  const order = parsed.data.direction === 'up' ? 'desc' : 'asc';
  const neighbor = await pool.query(
    `select id, order_num as "orderNum" from route_stops
     where courier_id = $1 and scheduled_date = $2 and order_num ${cmp} $3
     order by order_num ${order} limit 1`,
    [current.courierId, current.scheduledDate, current.orderNum]
  );
  if (neighbor.rows.length === 0) {
    res.json({ ok: true });
    return;
  }
  const n = neighbor.rows[0];
  await pool.query('begin');
  await pool.query(`update route_stops set order_num = $2 where id = $1`, [current.id, n.orderNum]);
  await pool.query(`update route_stops set order_num = $2 where id = $1`, [n.id, current.orderNum]);
  await pool.query('commit');
  res.json({ ok: true });
});

routeStopsRouter.delete('/route-stops/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const del = await pool.query(`delete from route_stops where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Parada no encontrada.' });
    return;
  }
  res.json({ ok: true });
});
