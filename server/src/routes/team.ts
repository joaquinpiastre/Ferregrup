import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const teamRouter = Router();

teamRouter.get('/team', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const roles = req.user!.role === 'superadmin' ? ['superadmin', 'admin', 'repartidor'] : ['admin', 'repartidor'];
  const { rows } = await pool.query(
    `select id, name, role, active from staff where role = any($1) order by active desc, role, name`,
    [roles]
  );
  res.json({ staff: rows });
});

const createSchema = z.object({
  id: z.string().trim().min(2).regex(/^[a-zA-Z0-9._-]+$/, 'Usuario inválido.'),
  name: z.string().trim().min(2),
  pin: z.string().regex(/^\d{4}$/),
  role: z.enum(['superadmin', 'admin', 'repartidor']),
});

teamRouter.post('/team', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const { id, name, pin, role } = parsed.data;
  if (role === 'superadmin' && req.user!.role !== 'superadmin') {
    res.status(403).json({ error: 'Solo un superadmin puede crear otro superadmin.' });
    return;
  }
  await pool.query(
    `insert into staff (id, name, pin, role) values ($1,$2,$3,$4)
     on conflict (id) do update set name = excluded.name, pin = excluded.pin, role = excluded.role, active = true`,
    [id, name, pin, role]
  );
  res.json({ ok: true, staff: { id, name, role } });
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    pin: z.string().regex(/^\d{4}$/).optional(),
    active: z.boolean().optional(),
    role: z.enum(['superadmin', 'admin', 'repartidor']).optional(),
  })
  .refine((x) => x.name !== undefined || x.pin !== undefined || x.active !== undefined || x.role !== undefined, {
    message: 'Enviá al menos un campo para actualizar.',
  });

teamRouter.patch('/team/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const isSuperadmin = req.user!.role === 'superadmin';
  const roles = isSuperadmin ? ['superadmin', 'admin', 'repartidor'] : ['admin', 'repartidor'];
  const { rows } = await pool.query(`select * from staff where id = $1 and role = any($2)`, [req.params.id, roles]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }
  const prev = rows[0];
  const p = parsed.data;
  if (p.role === 'superadmin' && !isSuperadmin) {
    res.status(403).json({ error: 'Solo un superadmin puede asignar el rol superadmin.' });
    return;
  }
  if (prev.role === 'superadmin' && !isSuperadmin) {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  await pool.query(
    `update staff set name = $2, pin = $3, active = $4, role = $5 where id = $1`,
    [req.params.id, p.name ?? prev.name, p.pin ?? prev.pin, p.active ?? prev.active, p.role ?? prev.role]
  );
  res.json({ ok: true });
});
