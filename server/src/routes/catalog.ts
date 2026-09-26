import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const catalogRouter = Router();

catalogRouter.get('/catalog', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select code, description, unit_price as "unitPrice", stock, cost_price as "costPrice", iva_rate as "ivaRate"
     from catalog_products where active = true order by description`
  );
  const isRepartidor = req.user?.role === 'repartidor';
  res.json({
    products: rows.map((r) => ({
      ...r,
      unitPrice: Number(r.unitPrice),
      stock: Number(r.stock),
      ivaRate: Number(r.ivaRate),
      costPrice: isRepartidor || r.costPrice === null ? undefined : Number(r.costPrice),
    })),
  });
});

const productSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  costPrice: z.number().nonnegative().optional(),
  ivaRate: z.number().nonnegative().default(21),
});

catalogRouter.post('/catalog', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  await pool.query(
    `insert into catalog_products (code, description, unit_price, stock, cost_price, iva_rate, active, updated_at)
     values ($1,$2,$3,$4,$5,$6,true,now())
     on conflict (code) do update set
       description = excluded.description, unit_price = excluded.unit_price,
       stock = excluded.stock, cost_price = excluded.cost_price, iva_rate = excluded.iva_rate,
       active = true, updated_at = now()`,
    [p.code, p.description, p.unitPrice, p.stock, p.costPrice ?? null, p.ivaRate]
  );
  res.json({ ok: true });
});

const stockAdjustSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('add'),
    quantity: z.number().int().refine((n) => n !== 0, 'La cantidad no puede ser 0.'),
  }),
  z.object({ mode: z.literal('set'), quantity: z.number().int().nonnegative('El stock no puede ser negativo.') }),
]);

catalogRouter.patch('/catalog/:code/stock', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = stockAdjustSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const { mode, quantity } = parsed.data;
  const newStock = mode === 'add' ? 'p.stock + $2' : '$2';
  const { rows } = await pool.query(
    `with old as (select stock from catalog_products where code = $1 and active = true for update)
     update catalog_products p set stock = ${newStock}, updated_at = now()
     from old where p.code = $1
     returning p.description, old.stock as prev, p.stock as stock`,
    [req.params.code, quantity]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  const { description, prev, stock } = rows[0];
  const summary =
    mode === 'add'
      ? `${quantity > 0 ? 'Ingresó' : 'Descontó'} ${Math.abs(quantity)} u. de ${description} (stock ${prev} → ${stock})`
      : `Corrigió el stock de ${description} (${prev} → ${stock})`;
  await logActivity(req.user!, 'stock.adjust', summary);
  res.json({ stock: Number(stock), prev: Number(prev) });
});

catalogRouter.delete('/catalog/:code', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`update catalog_products set active = false where code = $1`, [req.params.code]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
