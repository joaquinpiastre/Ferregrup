import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const catalogRouter = Router();

catalogRouter.get('/catalog', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `select code, description, unit_price as "unitPrice"
     from catalog_products where active = true order by description`
  );
  res.json({ products: rows.map((r) => ({ ...r, unitPrice: Number(r.unitPrice) })) });
});

const productSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  unitPrice: z.number().nonnegative(),
});

catalogRouter.post('/catalog', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  await pool.query(
    `insert into catalog_products (code, description, unit_price, active, updated_at)
     values ($1,$2,$3,true,now())
     on conflict (code) do update set
       description = excluded.description, unit_price = excluded.unit_price,
       active = true, updated_at = now()`,
    [p.code, p.description, p.unitPrice]
  );
  res.json({ ok: true });
});

catalogRouter.delete('/catalog/:code', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const del = await pool.query(`update catalog_products set active = false where code = $1`, [req.params.code]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
