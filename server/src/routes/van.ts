import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

export const vanRouter = Router();

vanRouter.get('/van', requireAuth, requireRole('admin'), async (_req, res) => {
  const [{ rows: items }, { rows: movements }] = await Promise.all([
    pool.query(
      `select v.code, p.description, p.unit_price as "unitPrice", v.quantity
       from van_stock v join catalog_products p on p.code = v.code
       where v.quantity > 0 order by p.description`
    ),
    pool.query(
      `select id, code, description, quantity, kind, courier_id as "courierId", courier_name as "courierName",
         notes, staff_name as "staffName", created_at_ms as "createdAt"
       from van_movements order by created_at_ms desc limit 100`
    ),
  ]);
  res.json({
    items: items.map((r) => ({ ...r, unitPrice: Number(r.unitPrice), quantity: Number(r.quantity) })),
    movements: movements.map((r) => ({ ...r, quantity: Number(r.quantity), createdAt: Number(r.createdAt) })),
  });
});

const moveSchema = z.object({
  code: z.string().min(1),
  quantity: z.number().int().positive(),
  kind: z.enum(['carga', 'devolucion', 'muestra']),
  courierId: z.string().optional(),
  notes: z.string().optional(),
});

const KIND_LABEL = { carga: 'Cargó a la camioneta', devolucion: 'Devolvió al depósito desde la camioneta', muestra: 'Dio de baja como muestra' } as const;

vanRouter.post('/van/move', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const m = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: prod } = await client.query(
      `select description, stock from catalog_products where code = $1 and active = true for update`,
      [m.code]
    );
    if (prod.length === 0) {
      await client.query('rollback');
      res.status(404).json({ error: 'Producto no encontrado.' });
      return;
    }
    const description: string = prod[0].description;

    let courierName: string | null = null;
    if (m.courierId) {
      const { rows } = await client.query(`select name from staff where id = $1`, [m.courierId]);
      if (rows.length === 0) {
        await client.query('rollback');
        res.status(400).json({ error: 'El repartidor indicado no existe.' });
        return;
      }
      courierName = rows[0].name;
    }

    if (m.kind === 'carga') {
      await client.query(`update catalog_products set stock = stock - $2, updated_at = now() where code = $1`, [m.code, m.quantity]);
      await client.query(
        `insert into van_stock (code, quantity) values ($1, $2)
         on conflict (code) do update set quantity = van_stock.quantity + excluded.quantity`,
        [m.code, m.quantity]
      );
    } else {
      const { rows } = await client.query(
        `update van_stock set quantity = quantity - $2 where code = $1 and quantity >= $2 returning quantity`,
        [m.code, m.quantity]
      );
      if (rows.length === 0) {
        await client.query('rollback');
        res.status(400).json({ error: 'No hay esa cantidad en la camioneta.' });
        return;
      }
      if (m.kind === 'devolucion') {
        await client.query(`update catalog_products set stock = stock + $2, updated_at = now() where code = $1`, [m.code, m.quantity]);
      }
    }

    await client.query(
      `insert into van_movements (code, description, quantity, kind, courier_id, courier_name, notes, staff_id, staff_name, created_at_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [m.code, description, m.quantity, m.kind, m.courierId ?? null, courierName, m.notes?.trim() || null, req.user!.sub, req.user!.name, Date.now()]
    );
    await client.query('commit');
    await logActivity(
      req.user!,
      'van.move',
      `${KIND_LABEL[m.kind]} ${m.quantity} u. de ${description}${courierName ? ` (${courierName})` : ''}`
    );
    res.json({ ok: true });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
});
