import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db/client.js';

/** admin: todo · repartidor: vende, cobra y reparte · vendedor: vende y cobra (sin reparto). */
export type StaffRole = 'admin' | 'repartidor' | 'vendedor';

export interface AuthClaims {
  sub: string;
  name: string;
  role: StaffRole;
  /** Presente cuando el pedido lo hace el asistente de IA en nombre del usuario. */
  via?: 'ia';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthClaims;
  }
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: '30d' });
}

/**
 * Token de corta duración para que el asistente de IA llame a la API como el usuario:
 * hereda exactamente sus permisos de rol y deja la marca "via IA" en el log de actividad.
 */
export function signAiToken(user: AuthClaims): string {
  return jwt.sign({ sub: user.sub, name: user.name, role: user.role, via: 'ia' } satisfies AuthClaims, config.jwtSecret, {
    expiresIn: '10m',
  });
}

// El token dura 30 días, pero el rol y si el usuario sigue activo se leen de la base (con un
// caché corto): así desactivar a alguien o cambiarle el rol en Equipo tiene efecto enseguida.
const STAFF_CACHE_MS = 30_000;
const staffCache = new Map<string, { name: string; role: StaffRole; active: boolean; at: number }>();

async function currentStaff(id: string) {
  const cached = staffCache.get(id);
  if (cached && Date.now() - cached.at < STAFF_CACHE_MS) return cached;
  const { rows } = await pool.query(`select name, role, active from staff where id = $1`, [id]);
  const entry = rows[0] ? { name: rows[0].name as string, role: rows[0].role as StaffRole, active: rows[0].active as boolean, at: Date.now() } : null;
  if (entry) staffCache.set(id, entry);
  else staffCache.delete(id);
  return entry;
}

export function invalidateStaffCache(id: string): void {
  staffCache.delete(id);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta token Bearer.' });
    return;
  }
  let claims: AuthClaims;
  try {
    claims = jwt.verify(auth.slice(7), config.jwtSecret) as AuthClaims;
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
    return;
  }
  try {
    const staff = await currentStaff(claims.sub);
    if (!staff || !staff.active) {
      res.status(401).json({ error: 'Tu usuario está desactivado. Hablá con el administrador.' });
      return;
    }
    req.user = { ...claims, name: staff.name, role: staff.role };
  } catch (err) {
    next(err);
    return;
  }
  next();
}

// ─── Freno a la fuerza bruta del PIN (4 dígitos = solo 10.000 combinaciones) ───────────

const MAX_FAILED_LOGINS = 8;
const LOGIN_LOCK_MS = 15 * 60_000;
const failedLogins = new Map<string, { count: number; first: number }>();

/** Minutos que le faltan al bloqueo de ese usuario, o 0 si puede intentar. */
export function loginLockMinutes(id: string): number {
  const f = failedLogins.get(id.toLowerCase());
  if (!f) return 0;
  const elapsed = Date.now() - f.first;
  if (elapsed > LOGIN_LOCK_MS) {
    failedLogins.delete(id.toLowerCase());
    return 0;
  }
  return f.count >= MAX_FAILED_LOGINS ? Math.ceil((LOGIN_LOCK_MS - elapsed) / 60_000) : 0;
}

export function registerLoginResult(id: string, ok: boolean): void {
  const key = id.toLowerCase();
  if (ok) {
    failedLogins.delete(key);
    return;
  }
  const f = failedLogins.get(key);
  if (!f || Date.now() - f.first > LOGIN_LOCK_MS) failedLogins.set(key, { count: 1, first: Date.now() });
  else f.count += 1;
}

export function requireRole(...roles: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }
    next();
  };
}
