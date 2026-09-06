import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const logsRouter = Router();

logsRouter.get('/logs', requireAuth, requireRole('admin'), async (req, res) => {
  const staffId = typeof req.query.staffId === 'string' && req.query.staffId ? req.query.staffId : undefined;
  const { rows } = await pool.query(
    staffId
      ? `select id, staff_id as "staffId", staff_name as "staffName", staff_role as "staffRole",
           action, summary, created_at_ms as "createdAt"
         from activity_log where staff_id = $1 order by created_at_ms desc limit 300`
      : `select id, staff_id as "staffId", staff_name as "staffName", staff_role as "staffRole",
           action, summary, created_at_ms as "createdAt"
         from activity_log order by created_at_ms desc limit 300`,
    staffId ? [staffId] : []
  );
  res.json({ logs: rows.map((r) => ({ ...r, createdAt: Number(r.createdAt) })) });
});
