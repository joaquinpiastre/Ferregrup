import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const quotesRouter = Router();

const itemsJsonAgg = `
  coalesce(
    json_agg(
      json_build_object(
        'code', i.code,
        'description', i.description,
        'quantity', i.quantity,
        'unitPrice', i.unit_price,
        'subtotal', i.subtotal
      )
    ) filter (where i.id is not null),
    '[]'::json
  ) as items
`;

quotesRouter.get('/quotes', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select q.id, q.client_name as "clientName", q.staff_name as "staffName", q.total, q.notes,
       q.created_at_ms as "createdAt", ${itemsJsonAgg}
     from quotes q left join quote_items i on i.quote_id = q.id
     group by q.id order by q.created_at_ms desc limit 300`
  );
  res.json({ quotes: rows.map((r) => ({ ...r, total: Number(r.total) })) });
});

const itemSchema = z.object({
  code: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const quoteSchema = z.object({
  clientName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

quotesRouter.post('/quotes', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const q = parsed.data;
  const id = `cot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = Date.now();
  const items = q.items.map((it) => ({ ...it, subtotal: Math.round(it.quantity * it.unitPrice * 100) / 100 }));
  const total = Math.round(items.reduce((sum, it) => sum + it.subtotal, 0) * 100) / 100;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into quotes (id, client_name, staff_id, staff_name, total, notes, created_at_ms)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, q.clientName ?? null, req.user!.sub, req.user!.name, total, q.notes ?? null, createdAt]
    );
    for (const item of items) {
      await client.query(
        `insert into quote_items (quote_id, code, description, quantity, unit_price, subtotal)
         values ($1,$2,$3,$4,$5,$6)`,
        [id, item.code ?? null, item.description, item.quantity, item.unitPrice, item.subtotal]
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await logActivity(req.user!, 'quote.create', `Creó una cotización de ${total}${q.clientName ? ` para ${q.clientName}` : ''}`);
  res.json({ id, total, createdAt });
});

quotesRouter.delete('/quotes/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`delete from quotes where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Cotización no encontrada.' });
    return;
  }
  await logActivity(req.user!, 'quote.delete', `Eliminó una cotización`);
  res.json({ ok: true });
});
