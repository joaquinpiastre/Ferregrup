import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const paymentsRouter = Router();

paymentsRouter.get('/payments', requireAuth, async (req, res) => {
  const isRepartidor = req.user?.role === 'repartidor';
  const { rows } = await pool.query(
    isRepartidor
      ? `select id, client_id as "clientId", client_name as "clientName", courier_id as "courierId",
           courier_name as "courierName", amount, method, check_number as "checkNumber", bank, notes,
           installment_id as "installmentId", created_at_ms as "createdAt"
         from payments where courier_id = $1 order by created_at_ms desc limit 200`
      : `select id, client_id as "clientId", client_name as "clientName", courier_id as "courierId",
           courier_name as "courierName", amount, method, check_number as "checkNumber", bank, notes,
           installment_id as "installmentId", created_at_ms as "createdAt"
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
  installmentId: z.string().optional(),
});

paymentsRouter.post('/payments', requireAuth, async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  // Un repartidor solo carga cobros a su propio nombre; el admin puede cargarlos a nombre de cualquier integrante del equipo.
  if (req.user!.role === 'repartidor') {
    p.courierId = req.user!.sub;
    p.courierName = req.user!.name;
  } else {
    const { rows } = await pool.query(`select name from staff where id = $1`, [p.courierId]);
    if (rows.length === 0) {
      res.status(400).json({ error: 'El repartidor indicado no existe.' });
      return;
    }
    p.courierName = rows[0].name;
  }

  if (p.installmentId) {
    const { rows } = await pool.query(
      `select s.client_id as "clientId" from sale_installments si
       join sales s on s.id = si.sale_id where si.id = $1`,
      [p.installmentId]
    );
    if (rows.length === 0) {
      res.status(400).json({ error: 'La cuota indicada no existe.' });
      return;
    }
    if (p.clientId && rows[0].clientId && rows[0].clientId !== p.clientId) {
      res.status(400).json({ error: 'La cuota no corresponde a ese cliente.' });
      return;
    }
  }

  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `insert into payments (id, client_id, client_name, courier_id, courier_name, amount, method, check_number, bank, notes, installment_id, created_at_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, p.clientId ?? null, p.clientName, p.courierId, p.courierName, p.amount, p.method, p.checkNumber ?? null, p.bank ?? null, p.notes ?? null, p.installmentId ?? null, Date.now()]
  );
  await logActivity(
    req.user!,
    'payment.create',
    `Registró un cobro de ${p.amount} a ${p.clientName} (${p.method})${p.installmentId ? ' aplicado a una cuota' : ''}`
  );
  res.json({ id, createdAt: Date.now() });
});

// Correcciones (solo admin): un repartidor cargó mal un monto o una cuota de más.
const paymentPatchSchema = z.object({
  amount: z.number().positive().optional(),
  method: z.enum(['efectivo', 'transferencia', 'cheque', 'otro']).optional(),
  checkNumber: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

paymentsRouter.patch('/payments/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = paymentPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  const { rows } = await pool.query(
    `update payments set
       amount = coalesce($2, amount),
       method = coalesce($3, method),
       check_number = case when $3::text is null then check_number when $3 = 'cheque' then $4 else null end,
       bank = case when $3::text is null then bank when $3 = 'cheque' then $5 else null end,
       notes = case when $6::boolean then $7 else notes end
     where id = $1
     returning client_name as "clientName", amount, method`,
    [req.params.id, p.amount ?? null, p.method ?? null, p.checkNumber ?? null, p.bank ?? null, p.notes !== undefined, p.notes ?? null]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Cobro no encontrado.' });
    return;
  }
  await logActivity(req.user!, 'payment.update', `Corrigió un cobro de ${rows[0].clientName}: ahora es de ${Number(rows[0].amount)} (${rows[0].method})`);
  res.json({ ok: true });
});

paymentsRouter.delete('/payments/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await pool.query(
    `delete from payments where id = $1 returning client_name as "clientName", courier_name as "courierName", amount`,
    [req.params.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Cobro no encontrado.' });
    return;
  }
  await logActivity(
    req.user!,
    'payment.delete',
    `Eliminó un cobro de ${Number(rows[0].amount)} de ${rows[0].clientName} (cargado por ${rows[0].courierName})`
  );
  res.json({ ok: true });
});
