import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const suppliersRouter = Router();

suppliersRouter.get('/suppliers', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, phone, notes, active from suppliers where active = true order by name`
  );
  res.json({ suppliers: rows });
});

const supplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

suppliersRouter.post('/suppliers', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const s = parsed.data;
  await pool.query(
    `insert into suppliers (id, name, phone, notes) values ($1,$2,$3,$4)
     on conflict (id) do update set name = excluded.name, phone = excluded.phone, notes = excluded.notes, active = true`,
    [s.id, s.name, s.phone ?? null, s.notes ?? null]
  );
  await logActivity(req.user!, 'supplier.create', `Creó/actualizó el proveedor ${s.name}`);
  res.json({ ok: true });
});

suppliersRouter.delete('/suppliers/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`update suppliers set active = false where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Proveedor no encontrado.' });
    return;
  }
  await logActivity(req.user!, 'supplier.delete', `Eliminó un proveedor`);
  res.json({ ok: true });
});

// ─── Deudas con proveedores ─────────────────────────────────────────────────

suppliersRouter.get('/supplier-debts', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select id, supplier_id as "supplierId", supplier_name as "supplierName", invoice_number as "invoiceNumber",
       amount, issue_date::text as "issueDate", due_date::text as "dueDate", status,
       payment_method as "paymentMethod", echeq_number as "echeqNumber", echeq_date::text as "echeqDate",
       notes, created_at_ms as "createdAt"
     from supplier_debts
     order by (status = 'pendiente') desc, due_date nulls last, created_at_ms desc`
  );
  res.json({ debts: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
});

const debtSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().min(1),
  invoiceNumber: z.string().optional(),
  amount: z.number().positive(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

suppliersRouter.post('/supplier-debts', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = debtSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const d = parsed.data;
  const id = `debt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `insert into supplier_debts (id, supplier_id, supplier_name, invoice_number, amount, issue_date, due_date, notes, created_at_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, d.supplierId, d.supplierName, d.invoiceNumber ?? null, d.amount, d.issueDate ?? null, d.dueDate ?? null, d.notes ?? null, Date.now()]
  );
  await logActivity(
    req.user!,
    'supplier_debt.create',
    `Cargó una deuda de ${d.amount} con ${d.supplierName}${d.invoiceNumber ? ` (factura ${d.invoiceNumber})` : ''}`
  );
  res.json({ id });
});

const paySchema = z
  .object({
    paymentMethod: z.enum(['efectivo', 'transferencia', 'cheque', 'echeq', 'otro']),
    echeqNumber: z.string().optional(),
    echeqDate: z.string().optional(),
  })
  .refine((d) => d.paymentMethod !== 'echeq' || !!d.echeqNumber?.trim(), { message: 'Ingresá el número de ECHEQ.' });

suppliersRouter.patch('/supplier-debts/:id/pay', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  const upd = await pool.query(
    `update supplier_debts set status = 'pagado', payment_method = $2, echeq_number = $3, echeq_date = $4, paid_at_ms = $5
     where id = $1`,
    [req.params.id, p.paymentMethod, p.echeqNumber ?? null, p.echeqDate ?? null, Date.now()]
  );
  if (upd.rowCount === 0) {
    res.status(404).json({ error: 'Deuda no encontrada.' });
    return;
  }
  await logActivity(
    req.user!,
    'supplier_debt.pay',
    `Marcó como pagada una deuda a proveedor (${p.paymentMethod}${p.paymentMethod === 'echeq' && p.echeqNumber ? ` #${p.echeqNumber}` : ''})`
  );
  res.json({ ok: true });
});

suppliersRouter.delete('/supplier-debts/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`delete from supplier_debts where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Deuda no encontrada.' });
    return;
  }
  await logActivity(req.user!, 'supplier_debt.delete', `Eliminó una deuda con proveedor`);
  res.json({ ok: true });
});
