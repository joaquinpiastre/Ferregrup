import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

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

catalogRouter.delete('/catalog/:code', requireAuth, requireRole('admin'), async (req, res) => {
  const del = await pool.query(`update catalog_products set active = false where code = $1`, [req.params.code]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
