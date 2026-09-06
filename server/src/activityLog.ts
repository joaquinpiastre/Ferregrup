import { pool } from './db/client.js';
import type { AuthClaims } from './auth.js';

export async function logActivity(user: AuthClaims, action: string, summary: string): Promise<void> {
  try {
    await pool.query(
      `insert into activity_log (staff_id, staff_name, staff_role, action, summary, created_at_ms)
       values ($1,$2,$3,$4,$5,$6)`,
      [user.sub, user.name, user.role, action, summary, Date.now()]
    );
  } catch (err) {
    console.error('No se pudo registrar el log de actividad:', err);
  }
}
