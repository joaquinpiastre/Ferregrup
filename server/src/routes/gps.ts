import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const gpsRouter = Router();

export async function recordGpsPoint(courierId: string, lat: number, lng: number, timestampMs: number): Promise<void> {
  await pool.query(
    `insert into gps_points (courier_id, lat, lng, timestamp_ms) values ($1,$2,$3,$4)`,
    [courierId, lat, lng, timestampMs]
  );
}

export async function touchTracker(imei: string): Promise<string | null> {
  const { rows } = await pool.query(
    `update trackers set last_contact_ms = $2 where imei = $1 and active = true returning courier_id as "courierId"`,
    [imei, Date.now()]
  );
  return rows[0]?.courierId ?? null;
}

const updateSchema = z.object({ lat: z.number(), lng: z.number() });

gpsRouter.post('/gps/update', requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  await recordGpsPoint(req.user!.sub, parsed.data.lat, parsed.data.lng, Date.now());
  res.json({ ok: true });
});

gpsRouter.get('/gps/live', requireAuth, requireRole('admin', 'superadmin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select distinct on (courier_id)
       courier_id as "courierId", s.name as "courierName", lat, lng, timestamp_ms as "timestampMs"
     from gps_points g
     join staff s on s.id = g.courier_id
     where timestamp_ms > $1
     order by courier_id, timestamp_ms desc`,
    [Date.now() - 24 * 60 * 60 * 1000]
  );
  res.json({ positions: rows.map((r) => ({ ...r, timestampMs: Number(r.timestampMs) })) });
});
