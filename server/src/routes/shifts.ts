import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const shiftsRouter = Router();

/** Fecha (AAAA-MM-DD) en hora de Argentina de un instante: el servidor corre en UTC. */
function arDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

shiftsRouter.get('/shifts/active', requireAuth, async (req, res) => {
  const courierId = req.user!.role !== 'admin' ? req.user!.sub : (req.query.courierId as string);
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
  // Un repartidor solo puede iniciar su propio turno.
  const ownOnly = req.user!.role !== 'admin';
  const courierId = ownOnly ? req.user!.sub : parsed.data.courierId;
  const courierName = ownOnly ? req.user!.name : parsed.data.courierName;
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serializa los "iniciar turno" del mismo repartidor (un doble toque no abre dos turnos).
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`shift:${courierId}`]);
    const existing = await client.query(
      `select id from shifts where courier_id = $1 and ended_at_ms is null limit 1`,
      [courierId]
    );
    if (existing.rows.length > 0) {
      await client.query('commit');
      res.json({ id: existing.rows[0].id });
      return;
    }
    const id = `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await client.query(
      `insert into shifts (id, courier_id, courier_name, started_at_ms) values ($1,$2,$3,$4)`,
      [id, courierId, courierName, Date.now()]
    );
    await client.query('commit');
    res.json({ id });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
});

shiftsRouter.post('/shifts/:id/end', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`select * from shifts where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Turno no encontrado.' });
    return;
  }
  const shift = rows[0];
  if (req.user!.role !== 'admin' && shift.courier_id !== req.user!.sub) {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  // Las paradas del día en que empezó el turno (en hora de Argentina).
  const stats = await pool.query(
    `select count(*) filter (where status = 'entregado') as completed, count(*) as total
     from route_stops where courier_id = $1 and scheduled_date = $2`,
    [shift.courier_id, arDate(Number(shift.started_at_ms))]
  );
  const endedAt = Date.now();
  const minutes = Math.round((endedAt - Number(shift.started_at_ms)) / 60000);
  await pool.query(
    `update shifts set ended_at_ms = $2, completed_count = $3, total_count = $4, minutes_on_route = $5 where id = $1`,
    [req.params.id, endedAt, Number(stats.rows[0].completed), Number(stats.rows[0].total), minutes]
  );
  res.json({ ok: true, completedCount: Number(stats.rows[0].completed), totalCount: Number(stats.rows[0].total), minutesOnRoute: minutes });
});

shiftsRouter.get('/shifts', requireAuth, requireRole('admin'), async (_req, res) => {
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

shiftsRouter.get('/shifts/:id/stops', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await pool.query(`select courier_id as "courierId", started_at_ms as "startedAt" from shifts where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Turno no encontrado.' });
    return;
  }
  const date = arDate(Number(rows[0].startedAt));
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
