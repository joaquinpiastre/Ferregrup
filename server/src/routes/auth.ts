import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requireAuth, signToken, type StaffRole } from '../auth.js';

export const authRouter = Router();

// Lista de repartidores/mostrador para selects internos (asignar rutas, trackers, etc).
// Requiere sesión: no se expone públicamente el directorio de usuarios.
authRouter.get('/staff', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, role from staff where active = true order by role, name`
  );
  res.json({ staff: rows });
});

const loginSchema = z.object({
  id: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
});

authRouter.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { rows } = await pool.query(
    `select id, name, role, pin from staff where id = $1 and active = true`,
    [parsed.data.id]
  );
  const staff = rows[0] as { id: string; name: string; role: StaffRole; pin: string } | undefined;
  if (!staff || staff.pin !== parsed.data.pin) {
    res.status(401).json({ error: 'PIN incorrecto.' });
    return;
  }
  const token = signToken({ sub: staff.id, name: staff.name, role: staff.role });
  res.json({ token, staff: { id: staff.id, name: staff.name, role: staff.role } });
});
