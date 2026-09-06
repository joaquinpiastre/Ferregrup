import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const goalsRouter = Router();

function periodRangeMs(periodType: 'semanal' | 'mensual', periodStart: string): { start: number; end: number } {
  const start = new Date(`${periodStart}T00:00:00`).getTime();
  if (periodType === 'semanal') {
    return { start, end: start + 7 * 24 * 60 * 60 * 1000 };
  }
  const end = new Date(`${periodStart}T00:00:00`);
  end.setMonth(end.getMonth() + 1);
  return { start, end: end.getTime() };
}

goalsRouter.get('/goals', requireAuth, async (req, res) => {
  const isRepartidor = req.user?.role === 'repartidor';
  const { rows } = await pool.query(
    isRepartidor
      ? `select id, courier_id as "courierId", courier_name as "courierName", period_type as "periodType",
           period_start::text as "periodStart", target_amount as "targetAmount", metric
         from courier_goals where courier_id = $1 order by period_start desc`
      : `select id, courier_id as "courierId", courier_name as "courierName", period_type as "periodType",
           period_start::text as "periodStart", target_amount as "targetAmount", metric
         from courier_goals order by period_start desc`,
    isRepartidor ? [req.user!.sub] : []
  );

  const goals = await Promise.all(
    rows.map(async (g) => {
      const { start, end } = periodRangeMs(g.periodType, g.periodStart);
      const [salesRes, paymentsRes] = await Promise.all([
        pool.query(
          `select coalesce(sum(amount), 0) as total from sales where courier_id = $1 and created_at_ms >= $2 and created_at_ms < $3`,
          [g.courierId, start, end]
        ),
        pool.query(
          `select coalesce(sum(amount), 0) as total from payments where courier_id = $1 and created_at_ms >= $2 and created_at_ms < $3`,
          [g.courierId, start, end]
        ),
      ]);
      const ventas = Number(salesRes.rows[0].total);
      const cobros = Number(paymentsRes.rows[0].total);
      const achieved = g.metric === 'ventas' ? ventas : g.metric === 'cobros' ? cobros : ventas + cobros;
      return { ...g, targetAmount: Number(g.targetAmount), ventas, cobros, achieved };
    })
  );

  res.json({ goals });
});

const goalSchema = z.object({
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  periodType: z.enum(['semanal', 'mensual']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetAmount: z.number().positive(),
  metric: z.enum(['cobros', 'ventas', 'ambos']).default('ambos'),
});

goalsRouter.post('/goals', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const g = parsed.data;
  const id = `goal-${g.courierId}-${g.periodType}-${g.periodStart}`;
  await pool.query(
    `insert into courier_goals (id, courier_id, courier_name, period_type, period_start, target_amount, metric)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (courier_id, period_type, period_start)
     do update set target_amount = excluded.target_amount, metric = excluded.metric, courier_name = excluded.courier_name`,
    [id, g.courierId, g.courierName, g.periodType, g.periodStart, g.targetAmount, g.metric]
  );
  await logActivity(req.user!, 'goal.set', `Definió objetivo ${g.periodType} de ${g.targetAmount} para ${g.courierName}`);
  res.json({ id });
});

goalsRouter.delete('/goals/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`delete from courier_goals where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Objetivo no encontrado.' });
    return;
  }
  await logActivity(req.user!, 'goal.delete', `Eliminó un objetivo`);
  res.json({ ok: true });
});
