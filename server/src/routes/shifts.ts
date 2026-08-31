import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const shiftsRouter = Router();

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

shiftsRouter.get('/shifts/active', requireAuth, async (req, res) => {
  const courierId = req.user!.role === 'repartidor' ? req.user!.sub : (req.query.courierId as string);
  if (!courierId) {
    res.status(400).json({ error: 'Falta courierId.' });
    return;
  }
  const { rows } = await pool.query(
    `select id, courier_id as "courierId", courier_name as "courierName",
       started_at_ms as "startedAt", ended_at_ms as "endedAt",
       completed_count as "completedCount", total_count as "totalCount"
     from shifts where courier_id = $1 and ended_at_ms is null
     order by started_at_ms desc limit 1`,
    [courierId]
  );
  const shift = rows[0];
  res.json({
    shift: shift ? { ...shift, startedAt: Number(shift.startedAt), endedAt: shift.endedAt !== null ? Number(shift.endedAt) : undefined } : null,
  });
});

const startSchema = z.object({ courierId: z.string().min(1), courierName: z.string().min(1) });

shiftsRouter.post('/shifts/start', requireAuth, async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { courierId, courierName } = parsed.data;
  const existing = await pool.query(
    `select id from shifts where courier_id = $1 and ended_at_ms is null limit 1`,
    [courierId]
  );
  if (existing.rows.length > 0) {
    res.json({ id: existing.rows[0].id });
    return;
  }
  const id = `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `insert into shifts (id, courier_id, courier_name, started_at_ms) values ($1,$2,$3,$4)`,
    [id, courierId, courierName, Date.now()]
  );
  res.json({ id });
});

shiftsRouter.post('/shifts/:id/end', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`select * from shifts where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Turno no encontrado.' });
    return;
  }
  const shift = rows[0];
  const stats = await pool.query(
    `select count(*) filter (where status = 'entregado') as completed, count(*) as total
     from route_stops where courier_id = $1 and scheduled_date = $2`,
    [shift.courier_id, todayDate()]
  );
  const endedAt = Date.now();
  const minutes = Math.round((endedAt - Number(shift.started_at_ms)) / 60000);
  await pool.query(
    `update shifts set ended_at_ms = $2, completed_count = $3, total_count = $4, minutes_on_route = $5 where id = $1`,
    [req.params.id, endedAt, Number(stats.rows[0].completed), Number(stats.rows[0].total), minutes]
  );
  res.json({ ok: true, completedCount: Number(stats.rows[0].completed), totalCount: Number(stats.rows[0].total), minutesOnRoute: minutes });
});

shiftsRouter.get('/shifts', requireAuth, requireRole('admin', 'superadmin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select id, courier_id as "courierId", courier_name as "courierName",
       started_at_ms as "startedAt", ended_at_ms as "endedAt",
       completed_count as "completedCount", total_count as "totalCount",
       minutes_on_route as "minutesOnRoute"
     from shifts order by started_at_ms desc limit 50`
  );
  res.json({
    shifts: rows.map((r) => ({ ...r, startedAt: Number(r.startedAt), endedAt: r.endedAt !== null ? Number(r.endedAt) : undefined })),
  });
});

shiftsRouter.get('/shifts/:id/stops', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const { rows } = await pool.query(`select courier_id as "courierId", started_at_ms as "startedAt" from shifts where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Turno no encontrado.' });
    return;
  }
  const date = new Date(Number(rows[0].startedAt)).toISOString().slice(0, 10);
  const stops = await pool.query(
    `select client_name as "clientName", client_address as "clientAddress", status,
       admin_notes as "adminNotes", courier_notes as "courierNotes",
       arrived_at_ms as "arrivedAt", left_at_ms as "leftAt"
     from route_stops where courier_id = $1 and scheduled_date = $2 order by order_num`,
    [rows[0].courierId, date]
  );
  res.json({
    stops: stops.rows.map((r) => ({
      ...r,
      arrivedAt: r.arrivedAt !== null ? Number(r.arrivedAt) : undefined,
      leftAt: r.leftAt !== null ? Number(r.leftAt) : undefined,
    })),
  });
});
