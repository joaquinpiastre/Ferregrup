import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const salesRouter = Router();

salesRouter.get('/sales', requireAuth, async (req, res) => {
  const isRepartidor = req.user?.role === 'repartidor';
  const { rows } = await pool.query(
    isRepartidor
      ? `select id, client_id as "clientId", client_name as "clientName", courier_id as "courierId",
           courier_name as "courierName", amount, description, created_at_ms as "createdAt"
         from sales where courier_id = $1 order by created_at_ms desc limit 200`
      : `select id, client_id as "clientId", client_name as "clientName", courier_id as "courierId",
           courier_name as "courierName", amount, description, created_at_ms as "createdAt"
         from sales order by created_at_ms desc limit 300`,
    isRepartidor ? [req.user!.sub] : []
  );
  res.json({ sales: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
});

const saleSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1),
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
});

salesRouter.post('/sales', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const s = parsed.data;
  const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `insert into sales (id, client_id, client_name, courier_id, courier_name, amount, description, created_at_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, s.clientId ?? null, s.clientName, s.courierId, s.courierName, s.amount, s.description ?? null, Date.now()]
  );
  await logActivity(req.user!, 'sale.create', `Cargó una venta de ${s.amount} para ${s.clientName} (repartidor ${s.courierName})`);
  res.json({ id, createdAt: Date.now() });
});

salesRouter.delete('/sales/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`delete from sales where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Venta no encontrada.' });
    return;
  }
  await logActivity(req.user!, 'sale.delete', `Eliminó una venta cargada`);
  res.json({ ok: true });
});
