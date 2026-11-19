import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { arToday, mondayOf as mondayOfDate } from '../collections.js';

export const statsRouter = Router();

const TRAILING_DAYS = 28;

// El servidor corre en UTC: la semana (desde el lunes) y el mes arrancan a las 00:00 de Argentina.
const AR_OFFSET = '-03:00';

function weekStartMs(): number {
  return Date.parse(`${mondayOfDate(arToday())}T00:00:00${AR_OFFSET}`);
}

function monthStartMs(): number {
  return Date.parse(`${arToday().slice(0, 7)}-01T00:00:00${AR_OFFSET}`);
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

  const weekStart = weekStartMs();
  const monthStart = monthStartMs();
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
