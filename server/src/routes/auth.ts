import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { loginLockMinutes, registerLoginResult, requireAuth, signToken, type StaffRole } from '../auth.js';
import { logActivity } from '../activityLog.js';

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
  const lock = loginLockMinutes(parsed.data.id);
  if (lock > 0) {
    res.status(429).json({ error: `Demasiados intentos fallidos. Probá de nuevo en ${lock} minuto${lock === 1 ? '' : 's'}.` });
    return;
  }
  const { rows } = await pool.query(
    `select id, name, role, pin from staff where id = $1 and active = true`,
    [parsed.data.id]
  );
  const staff = rows[0] as { id: string; name: string; role: StaffRole; pin: string } | undefined;
  if (!staff || staff.pin !== parsed.data.pin) {
    registerLoginResult(parsed.data.id, false);
    if (staff) await logActivity({ sub: staff.id, name: staff.name, role: staff.role }, 'auth.fail', 'Intento de inicio de sesión con PIN incorrecto');
    res.status(401).json({ error: 'PIN incorrecto.' });
    return;
  }
  registerLoginResult(parsed.data.id, true);
  const token = signToken({ sub: staff.id, name: staff.name, role: staff.role });
  await logActivity({ sub: staff.id, name: staff.name, role: staff.role }, 'auth.login', `Inició sesión`);
  res.json({ token, staff: { id: staff.id, name: staff.name, role: staff.role } });
});
