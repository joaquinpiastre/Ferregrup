import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const trackersRouter = Router();

trackersRouter.get('/trackers', requireAuth, requireRole('admin', 'superadmin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select imei, courier_id as "courierId", name, active, last_contact_ms as "lastContact"
     from trackers order by active desc, name`
  );
  res.json({ trackers: rows.map((r) => ({ ...r, lastContact: r.lastContact !== null ? Number(r.lastContact) : undefined })) });
});

const trackerSchema = z.object({
  imei: z.string().trim().regex(/^\d{15}$/, 'El IMEI debe tener 15 dígitos.'),
  courierId: z.string().min(1),
  name: z.string().trim().min(1),
});

trackersRouter.post('/trackers', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = trackerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const { imei, courierId, name } = parsed.data;
  await pool.query(
    `insert into trackers (imei, courier_id, name) values ($1,$2,$3)
     on conflict (imei) do update set courier_id = excluded.courier_id, name = excluded.name, active = true`,
    [imei, courierId, name]
  );
  res.json({ ok: true });
});

trackersRouter.delete('/trackers/:imei', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const del = await pool.query(`update trackers set active = false where imei = $1`, [req.params.imei]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Tracker no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
