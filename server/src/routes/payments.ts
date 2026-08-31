import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

export const paymentsRouter = Router();

paymentsRouter.get('/payments', requireAuth, async (req, res) => {
  const isRepartidor = req.user?.role === 'repartidor';
  const { rows } = await pool.query(
    isRepartidor
      ? `select id, client_id as "clientId", client_name as "clientName", courier_id as "courierId",
           courier_name as "courierName", amount, method, check_number as "checkNumber", bank, notes,
           created_at_ms as "createdAt"
         from payments where courier_id = $1 order by created_at_ms desc limit 200`
      : `select id, client_id as "clientId", client_name as "clientName", courier_id as "courierId",
           courier_name as "courierName", amount, method, check_number as "checkNumber", bank, notes,
           created_at_ms as "createdAt"
         from payments order by created_at_ms desc limit 300`,
    isRepartidor ? [req.user!.sub] : []
  );
  res.json({ payments: rows.map((r) => ({ ...r, amount: Number(r.amount), createdAt: Number(r.createdAt) })) });
});

const paymentSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1),
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['efectivo', 'transferencia', 'cheque', 'otro']),
  checkNumber: z.string().optional(),
  bank: z.string().optional(),
  notes: z.string().optional(),
});

paymentsRouter.post('/payments', requireAuth, async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `insert into payments (id, client_id, client_name, courier_id, courier_name, amount, method, check_number, bank, notes, created_at_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, p.clientId ?? null, p.clientName, p.courierId, p.courierName, p.amount, p.method, p.checkNumber ?? null, p.bank ?? null, p.notes ?? null, Date.now()]
  );
  res.json({ id, createdAt: Date.now() });
});
