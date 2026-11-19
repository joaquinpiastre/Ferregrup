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
  // El costo solo lo ve el admin.
  res.json({
    products: rows.map((r) => ({
      ...r,
      unitPrice: Number(r.unitPrice),
      stock: Number(r.stock),
      ivaRate: Number(r.ivaRate),
      costPrice: req.user?.role !== 'admin' || r.costPrice === null ? undefined : Number(r.costPrice),
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
  // Alta de un producto nuevo (o reactivación de uno dado de baja). Un producto activo no se
  // pisa desde acá: se edita con PATCH /catalog/:code y el stock con PATCH /catalog/:code/stock.
  const result = await pool.query(
    `insert into catalog_products (code, description, unit_price, stock, cost_price, iva_rate, active, updated_at)
     values ($1,$2,$3,$4,$5,$6,true,now())
     on conflict (code) do update set
       description = excluded.description, unit_price = excluded.unit_price,
       stock = excluded.stock, cost_price = excluded.cost_price, iva_rate = excluded.iva_rate,
       active = true, updated_at = now()
     where catalog_products.active = false`,
    [p.code, p.description, p.unitPrice, p.stock, p.costPrice ?? null, p.ivaRate]
  );
  if (result.rowCount === 0) {
    res.status(409).json({ error: `Ya existe un producto con el código ${p.code}. Editalo desde la lista.` });
    return;
  }
  await logActivity(req.user!, 'product.save', `Guardó el producto ${p.code} · ${p.description} ($${p.unitPrice})`);
  res.json({ ok: true });
});

// Edición parcial: solo cambia los campos enviados y nunca toca el stock (el POST de arriba
// reemplaza el producto entero, stock incluido).
const productPatchSchema = z
  .object({
    description: z.string().trim().min(1).optional(),
    unitPrice: z.number().nonnegative().optional(),
    costPrice: z.number().nonnegative().nullable().optional(),
    ivaRate: z.number().nonnegative().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'Enviá al menos un campo para actualizar.' });

catalogRouter.patch('/catalog/:code', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = productPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  const { rows } = await pool.query(
    `update catalog_products set
       description = coalesce($2, description),
       unit_price = coalesce($3, unit_price),
       cost_price = case when $4::boolean then $5 else cost_price end,
       iva_rate = coalesce($6, iva_rate),
       updated_at = now()
     where code = $1 and active = true
     returning description, unit_price as "unitPrice"`,
    [req.params.code, p.description ?? null, p.unitPrice ?? null, p.costPrice !== undefined, p.costPrice ?? null, p.ivaRate ?? null]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  const changes = [
    p.description !== undefined && 'descripción',
    p.unitPrice !== undefined && `precio $${p.unitPrice}`,
    p.costPrice !== undefined && 'costo',
    p.ivaRate !== undefined && `IVA ${p.ivaRate}%`,
  ].filter(Boolean);
  await logActivity(req.user!, 'product.update', `Editó ${req.params.code} · ${rows[0].description} (${changes.join(', ')})`);
  res.json({ ok: true, unitPrice: Number(rows[0].unitPrice) });
});

// ─── Actualización masiva de precios (aumentos por porcentaje, monto fijo o precio nuevo) ──

const bulkPriceSchema = z.object({
  codes: z.array(z.string().min(1)).min(1).max(20000),
  mode: z.enum(['percent', 'add', 'set']),
  value: z.number().finite(),
  rounding: z.enum(['none', 'unit', 'ten', 'hundred']).default('none'),
});

const ROUND_STEP = { none: 0.01, unit: 1, ten: 10, hundred: 100 } as const;

export function applyPriceChange(price: number, mode: 'percent' | 'add' | 'set', value: number, rounding: keyof typeof ROUND_STEP): number {
  const raw = mode === 'percent' ? price * (1 + value / 100) : mode === 'add' ? price + value : value;
  const step = ROUND_STEP[rounding];
  const rounded = Math.round(raw / step) * step;
  return Math.max(0, Math.round(rounded * 100) / 100);
}

catalogRouter.post('/catalog/bulk-price', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = bulkPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const { codes, mode, value, rounding } = parsed.data;
  if (mode === 'set' && value < 0) {
    res.status(400).json({ error: 'El precio no puede ser negativo.' });
    return;
  }
  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select code, unit_price from catalog_products where code = any($1::text[]) and active = true for update`,
      [codes]
    );
    for (const r of rows) {
      const next = applyPriceChange(Number(r.unit_price), mode, value, rounding);
      await client.query(`update catalog_products set unit_price = $2, updated_at = now() where code = $1`, [r.code, next]);
      updated += 1;
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  const how = mode === 'percent' ? `${value > 0 ? '+' : ''}${value}%` : mode === 'add' ? `${value > 0 ? '+' : ''}$${value}` : `precio $${value}`;
  await logActivity(req.user!, 'product.bulk_price', `Actualizó el precio de ${updated} producto${updated === 1 ? '' : 's'} (${how})`);
  res.json({ updated });
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
  const { rows } = await pool.query(
    `update catalog_products set active = false where code = $1 returning description`,
    [req.params.code]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  await logActivity(req.user!, 'product.delete', `Dio de baja el producto ${req.params.code} · ${rows[0].description}`);
  res.json({ ok: true });
});
