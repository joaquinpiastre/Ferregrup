import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const statsRouter = Router();

const TRAILING_DAYS = 28;

function mondayOf(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.getTime();
}

function firstOfMonth(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  return date.getTime();
}

async function sumSince(table: 'sales' | 'payments', sinceMs: number): Promise<number> {
  const { rows } = await pool.query(
    `select coalesce(sum(amount), 0) as total from ${table} where created_at_ms >= $1`,
    [sinceMs]
  );
  return Number(rows[0].total);
}

statsRouter.get('/stats/dashboard', requireAuth, requireRole('admin'), async (_req, res) => {
  const now = Date.now();
  const trailingStart = now - TRAILING_DAYS * 24 * 60 * 60 * 1000;

  const [trailingCobros, trailingVentas] = await Promise.all([
    sumSince('payments', trailingStart),
    sumSince('sales', trailingStart),
  ]);
  const avgDailyCobros = trailingCobros / TRAILING_DAYS;
  const avgDailyVentas = trailingVentas / TRAILING_DAYS;

  const weekStart = mondayOf(new Date(now));
  const monthStart = firstOfMonth(new Date(now));
  const [weekCobros, weekVentas, monthCobros, monthVentas] = await Promise.all([
    sumSince('payments', weekStart),
    sumSince('sales', weekStart),
    sumSince('payments', monthStart),
    sumSince('sales', monthStart),
  ]);

  res.json({
    avgDailyCobros,
    avgDailyVentas,
    semana: {
      actualCobros: weekCobros,
      actualVentas: weekVentas,
      proyeccionCobros: avgDailyCobros * 7,
      proyeccionVentas: avgDailyVentas * 7,
    },
    mes: {
      actualCobros: monthCobros,
      actualVentas: monthVentas,
      proyeccionCobros: avgDailyCobros * 30,
      proyeccionVentas: avgDailyVentas * 30,
    },
  });
});
