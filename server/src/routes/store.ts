import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';

// Tienda online: catálogo público (lo que se publica del catálogo, con su precio de siempre),
// fotos, pedidos y la administración de todo eso desde el panel.

export const storeRouter = Router();

export const STORE_CATEGORIES = [
  { slug: 'herramientas-electricas', name: 'Herramientas eléctricas' },
  { slug: 'herramientas-a-bateria', name: 'Herramientas a batería' },
  { slug: 'herramientas-de-mano', name: 'Herramientas de mano' },
  { slug: 'accesorios-y-consumibles', name: 'Accesorios y consumibles' },
  { slug: 'jardin-y-poda', name: 'Jardín y poda' },
  { slug: 'construccion-y-obra', name: 'Construcción y obra' },
  { slug: 'pinturas', name: 'Pinturas' },
  { slug: 'compresores-y-aire', name: 'Compresores y aire' },
  { slug: 'generadores-y-bombas', name: 'Generadores y bombas' },
  { slug: 'soldadura', name: 'Soldadura' },
  { slug: 'medicion', name: 'Medición' },
  { slug: 'hidrolavadoras-y-limpieza', name: 'Hidrolavadoras y limpieza' },
  { slug: 'taller-y-automotor', name: 'Taller y automotor' },
  { slug: 'cajas-y-almacenamiento', name: 'Cajas y almacenamiento' },
  { slug: 'seguridad', name: 'Seguridad' },
] as const;
const CATEGORY_SLUGS = STORE_CATEGORIES.map((c) => c.slug) as [string, ...string[]];

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Precio de venta con la oferta aplicada, redondeado al peso. */
const offerPrice = (price: number, pct: number | null) => (pct && pct > 0 ? Math.round(price * (1 - pct / 100)) : price);

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

interface Settings {
  cuotas: number;
  transferPct: number;
  whatsapp: string;
  shippingNote: string;
}

async function getSettings(): Promise<Settings> {
  const { rows } = await pool.query(`select cuotas, transfer_pct, whatsapp, shipping_note from web_settings where id = 1`);
  const r = rows[0] ?? {};
  return {
    cuotas: Number(r.cuotas ?? 3),
    transferPct: Number(r.transfer_pct ?? 0),
    whatsapp: r.whatsapp ?? '5492604696700',
    shippingNote: r.shipping_note ?? '',
  };
}

// ─── Público ────────────────────────────────────────────────────────────────────

storeRouter.get('/store/catalog', async (_req, res) => {
  const [settings, { rows }] = await Promise.all([
    getSettings(),
    pool.query(
      `select c.code, coalesce(c.web_name, c.description) as name, c.web_brand as brand, c.web_category as category,
         c.unit_price as price, c.iva_rate as iva, c.web_offer_pct as offer, c.web_featured as featured, c.web_rank as rank,
         i.id as image_id, i.updated_at_ms as image_v
       from catalog_products c left join web_images i on i.code = c.code
       where c.active and c.web_published and c.unit_price > 0
       order by c.web_rank nulls last, c.description`
    ),
  ]);
  const products = rows.map((r) => {
    const price = Number(r.price);
    const offer = r.offer === null ? 0 : Number(r.offer);
    return {
      code: r.code as string,
      slug: `${slugify(r.name)}-${slugify(r.code)}`,
      name: r.name as string,
      brand: (r.brand as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      price: offerPrice(price, offer),
      ...(offer > 0 ? { listPrice: price, offerPct: offer } : {}),
      iva: Number(r.iva),
      featured: !!r.featured,
      rank: r.rank === null ? null : Number(r.rank),
      image: r.image_id ? `/img/${r.image_id}.webp?v=${r.image_v}` : null,
    };
  });
  const counts = new Map<string, number>();
  for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.json({
    settings,
    categories: STORE_CATEGORIES.map((c) => ({ ...c, count: counts.get(c.slug) ?? 0 })).filter((c) => c.count > 0),
    products,
  });
});

storeRouter.get('/store/img/:id', async (req, res) => {
  const id = Number(String(req.params.id).replace(/\.webp$/, ''));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).end();
    return;
  }
  const { rows } = await pool.query(`select mime, data from web_images where id = $1`, [id]);
  if (!rows[0]) {
    res.status(404).end();
    return;
  }
  // La URL lleva la versión (?v=...): se puede guardar para siempre en el navegador y en el CDN.
  res.setHeader('Content-Type', rows[0].mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.send(rows[0].data);
});

const orderSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  delivery: z.enum(['envio', 'retiro']),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  payment: z.enum(['tarjeta', 'transferencia', 'efectivo']),
  notes: z.string().trim().max(500).optional(),
  // Trampa para robots: un campo oculto que una persona deja vacío.
  website: z.string().max(0).optional(),
  items: z.array(z.object({ code: z.string().min(1).max(60), qty: z.number().int().min(1).max(99) })).min(1).max(50),
});

// Límite simple de pedidos por IP (en memoria): evita que un robot llene la base.
const recent = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return list.length > 6;
}

storeRouter.post('/store/orders', async (req: Request, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Revisá los datos del pedido: nombre, teléfono y forma de entrega.' });
    return;
  }
  const o = parsed.data;
  if (o.delivery === 'envio' && !o.address) {
    res.status(400).json({ error: 'Para el envío necesitamos la dirección.' });
    return;
  }
  const ip = req.ip ?? 'desconocida';
  if (tooMany(ip)) {
    res.status(429).json({ error: 'Recibimos muchos pedidos seguidos desde tu conexión. Probá de nuevo en unos minutos o escribinos por WhatsApp.' });
    return;
  }
  const codes = [...new Set(o.items.map((i) => i.code))];
  const { rows } = await pool.query(
    `select code, coalesce(web_name, description) as name, unit_price, web_offer_pct from catalog_products
     where code = any($1::text[]) and active and web_published and unit_price > 0`,
    [codes]
  );
  const byCode = new Map(rows.map((r) => [r.code as string, r]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) {
    res.status(409).json({ error: 'Algún producto del carrito ya no está disponible. Actualizá la página y revisá el carrito.', missing });
    return;
  }
  // Los precios se calculan acá, nunca se toman del navegador.
  const items = o.items.map((i) => {
    const r = byCode.get(i.code)!;
    const unit = offerPrice(Number(r.unit_price), r.web_offer_pct === null ? 0 : Number(r.web_offer_pct));
    return { code: i.code, name: r.name as string, qty: i.qty, unitPrice: unit, subtotal: round2(unit * i.qty) };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));
  const settings = await getSettings();
  const discount = o.payment === 'transferencia' && settings.transferPct > 0 ? Math.round(subtotal * (settings.transferPct / 100)) : 0;
  const total = round2(subtotal - discount);
  const now = Date.now();
  const ins = await pool.query(
    `insert into web_orders (customer_name, customer_phone, customer_email, delivery, address, city, payment, notes, items, subtotal, discount, total, ip, created_at_ms, updated_at_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) returning id`,
    [o.name, o.phone, o.email || null, o.delivery, o.address || null, o.city || null, o.payment, o.notes || null, JSON.stringify(items), subtotal, discount, total, ip, now]
  );
  res.json({ id: Number(ins.rows[0].id), items, subtotal, discount, total, whatsapp: settings.whatsapp });
});

// ─── Administración (panel) ─────────────────────────────────────────────────────

const admin = [requireAuth, requireRole('admin')];

storeRouter.get('/store/admin/orders', ...admin, async (_req, res) => {
  const { rows } = await pool.query(
    `select id, status, customer_name as "name", customer_phone as "phone", customer_email as "email", delivery, address, city, payment, notes,
       items, subtotal, discount, total, admin_notes as "adminNotes", created_at_ms as "createdAt", updated_at_ms as "updatedAt"
     from web_orders order by created_at_ms desc limit 300`
  );
  res.json({
    orders: rows.map((r) => ({
      ...r,
      id: Number(r.id),
      subtotal: Number(r.subtotal),
      discount: Number(r.discount),
      total: Number(r.total),
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    })),
  });
});

// Para el aviso del menú del panel: cuántos pedidos web esperan respuesta.
storeRouter.get('/store/admin/summary', ...admin, async (_req, res) => {
  const { rows } = await pool.query(`select count(*)::int as n from web_orders where status = 'nuevo'`);
  res.json({ newOrders: rows[0]?.n ?? 0 });
});

const orderPatchSchema = z
  .object({
    status: z.enum(['nuevo', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado']).optional(),
    adminNotes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((p) => p.status !== undefined || p.adminNotes !== undefined);

storeRouter.patch('/store/admin/orders/:id', ...admin, async (req, res) => {
  const parsed = orderPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  const { rows } = await pool.query(
    `update web_orders set status = coalesce($2, status), admin_notes = case when $3::boolean then $4 else admin_notes end, updated_at_ms = $5
     where id = $1 returning id, status, customer_name`,
    [Number(req.params.id), p.status ?? null, p.adminNotes !== undefined, p.adminNotes ?? null, Date.now()]
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'Pedido no encontrado.' });
    return;
  }
  if (p.status) await logActivity(req.user!, 'store.order', `Pedido web #${rows[0].id} de ${rows[0].customer_name}: ${p.status}`);
  res.json({ ok: true });
});

storeRouter.get('/store/admin/products', ...admin, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const only = String(req.query.only ?? 'published');
  const params: unknown[] = [];
  const where = ['c.active'];
  if (only === 'published') where.push('c.web_published');
  for (const w of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
    params.push(`%${w.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(c.description ilike $${params.length} or c.web_name ilike $${params.length} or c.code ilike $${params.length} or c.supplier ilike $${params.length})`);
  }
  const { rows } = await pool.query(
    `select c.code, c.description, c.web_name as "webName", c.web_brand as "brand", c.web_category as "category", c.web_published as "published",
       c.web_offer_pct as "offerPct", c.web_featured as "featured", c.web_rank as "rank", c.unit_price as "price", c.supplier,
       i.id as "imageId", i.updated_at_ms as "imageV"
     from catalog_products c left join web_images i on i.code = c.code
     where ${where.join(' and ')}
     order by c.web_published desc, c.web_rank nulls last, c.description limit 500`,
    params
  );
  res.json({
    categories: STORE_CATEGORIES,
    products: rows.map((r) => ({
      ...r,
      price: Number(r.price),
      offerPct: r.offerPct === null ? null : Number(r.offerPct),
      rank: r.rank === null ? null : Number(r.rank),
      image: r.imageId ? `/img/${r.imageId}.webp?v=${r.imageV}` : null,
    })),
  });
});

const productPatchSchema = z.object({
  published: z.boolean().optional(),
  name: z.string().trim().max(160).nullable().optional(),
  brand: z.string().trim().max(60).nullable().optional(),
  category: z.enum(CATEGORY_SLUGS).nullable().optional(),
  offerPct: z.number().min(0).max(90).nullable().optional(),
  featured: z.boolean().optional(),
  rank: z.number().int().min(0).max(100000).nullable().optional(),
});

type ProductPatch = z.infer<typeof productPatchSchema>;

async function applyProductPatch(code: string, p: ProductPatch, client = pool) {
  const sets: string[] = [];
  const params: unknown[] = [code];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (p.published !== undefined) set('web_published', p.published);
  if (p.name !== undefined) set('web_name', p.name || null);
  if (p.brand !== undefined) set('web_brand', p.brand || null);
  if (p.category !== undefined) set('web_category', p.category);
  if (p.offerPct !== undefined) set('web_offer_pct', p.offerPct && p.offerPct > 0 ? p.offerPct : null);
  if (p.featured !== undefined) set('web_featured', p.featured);
  if (p.rank !== undefined) set('web_rank', p.rank);
  if (!sets.length) return 0;
  const r = await client.query(`update catalog_products set ${sets.join(', ')} where code = $1`, params);
  return r.rowCount ?? 0;
}

storeRouter.patch('/store/admin/products/:code', ...admin, async (req, res) => {
  const parsed = productPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const n = await applyProductPatch(req.params.code, parsed.data);
  if (!n) {
    res.status(404).json({ error: 'Producto no encontrado.' });
    return;
  }
  const p = parsed.data;
  const what = [
    p.published === true && 'publicó',
    p.published === false && 'sacó de la tienda',
    p.offerPct !== undefined && (p.offerPct ? `oferta ${p.offerPct}%` : 'sin oferta'),
    p.name !== undefined && 'nombre',
    p.category !== undefined && 'categoría',
    p.featured !== undefined && (p.featured ? 'destacado' : 'no destacado'),
  ].filter(Boolean);
  await logActivity(req.user!, 'store.product', `Tienda: ${req.params.code} (${what.join(', ') || 'cambios'})`);
  res.json({ ok: true });
});

const IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

async function saveImage(code: string, mime: string, data: Buffer, client = pool) {
  await client.query(
    `insert into web_images (code, mime, data, updated_at_ms) values ($1,$2,$3,$4)
     on conflict (code) do update set mime = excluded.mime, data = excluded.data, updated_at_ms = excluded.updated_at_ms`,
    [code, mime, data, Date.now()]
  );
}

storeRouter.put('/store/admin/products/:code/image', ...admin, (req, res, next) => {
  upload.single('image')(req, res, async (err: unknown) => {
    try {
      if (err || !req.file || !IMAGE_TYPES.has(req.file.mimetype)) {
        res.status(400).json({ error: 'Subí una foto en JPG, PNG o WebP de hasta 3 MB.' });
        return;
      }
      const exists = await pool.query(`select 1 from catalog_products where code = $1`, [req.params.code]);
      if (!exists.rowCount) {
        res.status(404).json({ error: 'Producto no encontrado.' });
        return;
      }
      await saveImage(req.params.code, req.file.mimetype, req.file.buffer);
      await logActivity(req.user!, 'store.product', `Tienda: foto nueva para ${req.params.code}`);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
});

// Publicación en bloque (la usa la carga inicial de la tienda): datos y foto de varios productos.
const bulkSchema = z.object({
  products: z
    .array(
      productPatchSchema.extend({
        code: z.string().min(1).max(60),
        image: z.string().max(2_000_000).optional(), // WebP en base64
      })
    )
    .min(1)
    .max(80),
});

storeRouter.post('/store/admin/bulk', ...admin, async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const client = await pool.connect();
  let updated = 0;
  const notFound: string[] = [];
  try {
    await client.query('begin');
    for (const { code, image, ...patch } of parsed.data.products) {
      const n = await applyProductPatch(code, patch, client as unknown as typeof pool);
      if (!n) {
        notFound.push(code);
        continue;
      }
      if (image) await saveImage(code, 'image/webp', Buffer.from(image, 'base64'), client as unknown as typeof pool);
      updated++;
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await logActivity(req.user!, 'store.product', `Tienda: ${updated} productos publicados o actualizados en bloque`);
  res.json({ updated, notFound });
});

storeRouter.get('/store/admin/settings', ...admin, async (_req, res) => {
  res.json(await getSettings());
});

const settingsSchema = z.object({
  cuotas: z.number().int().min(1).max(24),
  transferPct: z.number().min(0).max(50),
  whatsapp: z.string().trim().regex(/^\d{10,15}$/, 'El WhatsApp va con código de país, sin + ni espacios (ej.: 5492604696700).'),
  shippingNote: z.string().trim().max(300),
});

storeRouter.put('/store/admin/settings', ...admin, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const s = parsed.data;
  await pool.query(
    `update web_settings set cuotas = $1, transfer_pct = $2, whatsapp = $3, shipping_note = $4, updated_at_ms = $5 where id = 1`,
    [s.cuotas, s.transferPct, s.whatsapp, s.shippingNote, Date.now()]
  );
  await logActivity(req.user!, 'store.settings', `Ajustes de la tienda: ${s.cuotas} cuotas sin interés, ${s.transferPct}% por transferencia`);
  res.json({ ok: true });
});
