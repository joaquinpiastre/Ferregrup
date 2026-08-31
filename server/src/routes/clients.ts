import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const clientsRouter = Router();

clientsRouter.get('/clients', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, address, phone, notes, type, active
     from clients where active = true order by name`
  );
  res.json({ clients: rows });
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
  res.json({ ok: true });
});

clientsRouter.delete('/clients/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const del = await pool.query(`update clients set active = false where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
