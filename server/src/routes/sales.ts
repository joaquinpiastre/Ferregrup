import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const salesRouter = Router();

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

salesRouter.get('/sales', requireAuth, async (req, res) => {
  const isRepartidor = req.user?.role === 'repartidor';
  const { rows } = await pool.query(
    isRepartidor
      ? `select s.id, s.client_id as "clientId", s.client_name as "clientName", s.courier_id as "courierId",
           s.courier_name as "courierName", s.amount, s.description, s.created_at_ms as "createdAt", ${itemsJsonAgg}
         from sales s left join sale_items i on i.sale_id = s.id
         where s.courier_id = $1 group by s.id order by s.created_at_ms desc limit 200`
      : `select s.id, s.client_id as "clientId", s.client_name as "clientName", s.courier_id as "courierId",
           s.courier_name as "courierName", s.amount, s.description, s.created_at_ms as "createdAt", ${itemsJsonAgg}
         from sales s left join sale_items i on i.sale_id = s.id
         group by s.id order by s.created_at_ms desc limit 300`,
    isRepartidor ? [req.user!.sub] : []
  );
  res.json({ sales: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
});

const itemSchema = z.object({
  code: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const saleSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1),
  courierId: z.string().min(1),
  courierName: z.string().min(1),
  description: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

salesRouter.post('/sales', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const s = parsed.data;
  const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = Date.now();
  const items = s.items.map((it) => ({ ...it, subtotal: Math.round(it.quantity * it.unitPrice * 100) / 100 }));
  const total = Math.round(items.reduce((sum, it) => sum + it.subtotal, 0) * 100) / 100;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into sales (id, client_id, client_name, courier_id, courier_name, amount, description, created_at_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, s.clientId ?? null, s.clientName, s.courierId, s.courierName, total, s.description ?? null, createdAt]
    );
    for (const item of items) {
      await client.query(
        `insert into sale_items (sale_id, code, description, quantity, unit_price, subtotal)
         values ($1,$2,$3,$4,$5,$6)`,
        [id, item.code ?? null, item.description, item.quantity, item.unitPrice, item.subtotal]
      );
      if (item.code) {
        await client.query(`update catalog_products set stock = stock - $2 where code = $1`, [item.code, item.quantity]);
      }
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await logActivity(req.user!, 'sale.create', `Cargó una venta de ${total} para ${s.clientName} (repartidor ${s.courierName})`);
  res.json({ id, amount: total, createdAt });
});

salesRouter.delete('/sales/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: items } = await client.query(
      `select code, quantity from sale_items where sale_id = $1 and code is not null`,
      [req.params.id]
    );
    for (const item of items) {
      await client.query(`update catalog_products set stock = stock + $2 where code = $1`, [item.code, item.quantity]);
    }
    const del = await client.query(`delete from sales where id = $1`, [req.params.id]);
    if (del.rowCount === 0) {
      await client.query('rollback');
      res.status(404).json({ error: 'Venta no encontrada.' });
      return;
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await logActivity(req.user!, 'sale.delete', `Eliminó una venta cargada`);
  res.json({ ok: true });
});
