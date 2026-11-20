import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CreditCard, ExternalLink, Landmark, MessageCircle, Package, Search, Star, Store, Truck, Wallet } from 'lucide-react';
import {
  fetchWebProducts,
  fetchWebSettings,
  saveWebSettings,
  subscribeWebOrders,
  updateWebOrder,
  updateWebProduct,
  uploadWebProductImage,
} from '../api';
import { BRANDS } from '../../tienda/data';
import type { WebCategory, WebOrder, WebOrderStatus, WebProduct, WebProductPatch, WebSettings } from '../types';

// Administración de la tienda online: pedidos que entran por la web, qué productos se publican
// (con foto, oferta y categoría) y los ajustes generales (cuotas, WhatsApp, transferencia).

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const money = (n: number) => ars.format(n);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Error de conexión.');
const offerPrice = (price: number, pct: number | null) => (pct && pct > 0 ? Math.round(price * (1 - pct / 100)) : price);

/** Link "Ver la tienda" para el encabezado del panel. */
export function VerTiendaLink() {
  return (
    <a className="btn-secondary" href="/tienda" target="_blank" rel="noreferrer" style={{ padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}>
      <ExternalLink size={13} /> Ver la tienda
    </a>
  );
}

// ─── Pedidos web ────────────────────────────────────────────────────────────────

const STATUS: Record<WebOrderStatus, { label: string; badge: string }> = {
  nuevo: { label: 'Nuevo', badge: 'badge-yellow' },
  confirmado: { label: 'Confirmado', badge: 'badge-blue' },
  preparando: { label: 'Preparando', badge: 'badge-orange' },
  enviado: { label: 'Enviado / listo para retirar', badge: 'badge-blue' },
  entregado: { label: 'Entregado', badge: 'badge-green' },
  cancelado: { label: 'Cancelado', badge: 'badge-red' },
};
const PAYMENT: Record<WebOrder['payment'], { label: string; icon: typeof CreditCard }> = {
  tarjeta: { label: 'Tarjeta (cuotas sin interés)', icon: CreditCard },
  transferencia: { label: 'Transferencia', icon: Landmark },
  efectivo: { label: 'Efectivo', icon: Wallet },
};
type OrderFilter = 'activos' | 'nuevo' | 'entregado' | 'cancelado' | 'todos';
const FILTERS: { id: OrderFilter; label: string }[] = [
  { id: 'activos', label: 'En curso' },
  { id: 'nuevo', label: 'Nuevos' },
  { id: 'entregado', label: 'Entregados' },
  { id: 'cancelado', label: 'Cancelados' },
  { id: 'todos', label: 'Todos' },
];

/** Teléfono argentino como lo pide WhatsApp: 549 + característica + número, sin el 0 ni el 15. */
function waPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('549')) return d;
  if (d.startsWith('54')) return `549${d.slice(2)}`;
  d = d.replace(/^0/, '');
  if (d.length === 12) {
    for (const i of [2, 3, 4]) {
      if (d.slice(i, i + 2) === '15') {
        d = d.slice(0, i) + d.slice(i + 2);
        break;
      }
    }
  }
  return `549${d}`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function PedidosWebPanel({ token }: { token: string }) {
  const [orders, setOrders] = useState<WebOrder[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OrderFilter>('activos');

  useEffect(
    () =>
      subscribeWebOrders(
        token,
        (list) => {
          setOrders(list);
          setError('');
        },
        (e) => setError(errMsg(e))
      ),
    [token]
  );

  const shown = useMemo(() => {
    const list = orders ?? [];
    if (filter === 'todos') return list;
    if (filter === 'activos') return list.filter((o) => o.status !== 'entregado' && o.status !== 'cancelado');
    return list.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function change(order: WebOrder, patch: { status?: WebOrderStatus; adminNotes?: string | null }) {
    setOrders((list) => list?.map((o) => (o.id === order.id ? { ...o, ...patch } : o)) ?? list);
    try {
      await updateWebOrder(token, order.id, patch);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const count = (f: OrderFilter) =>
    (orders ?? []).filter((o) => (f === 'todos' ? true : f === 'activos' ? o.status !== 'entregado' && o.status !== 'cancelado' : o.status === f)).length;

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 14px', maxWidth: 760 }}>
        Los pedidos de la tienda online llegan acá. No se cobra nada en la web: escribile al cliente por WhatsApp para confirmar stock, entrega y pago, y
        después andá cambiando el estado.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span style={{ opacity: 0.7 }}>({count(f.id)})</span>
          </button>
        ))}
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {!orders ? (
        <div style={{ color: '#777', fontSize: 14 }}>Cargando pedidos…</div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: 14, padding: 36 }}>
          <Package size={28} style={{ color: '#555', marginBottom: 8 }} />
          <div>{orders.length === 0 ? 'Todavía no entraron pedidos por la tienda online.' : 'No hay pedidos en esta lista.'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {shown.map((o) => (
            <OrderCard key={o.id} order={o} onChange={(p) => change(o, p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order: o, onChange }: { order: WebOrder; onChange: (p: { status?: WebOrderStatus; adminNotes?: string | null }) => void }) {
  const Pay = PAYMENT[o.payment].icon;
  const first = o.name.split(/\s+/)[0];
  const wa = `https://wa.me/${waPhone(o.phone)}?text=${encodeURIComponent(`Hola ${first}! Te escribimos de El Maná por tu pedido #${o.id} de la tienda online.`)}`;
  return (
    <div className="card" style={{ padding: 16, borderColor: o.status === 'nuevo' ? '#FE480666' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: '#fff', fontSize: 16 }}>Pedido #{o.id}</strong>
        <span className={`badge ${STATUS[o.status].badge}`}>{STATUS[o.status].label}</span>
        <span style={{ color: '#777', fontSize: 12 }}>{fmtDate(o.createdAt)}</span>
        <strong style={{ marginLeft: 'auto', color: '#fff', fontSize: 18 }}>{money(o.total)}</strong>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <span style={{ color: '#ddd', fontSize: 14, fontWeight: 600 }}>{o.name}</span>
        <span style={{ color: '#999', fontSize: 13 }}>{o.phone}</span>
        {o.email && <span style={{ color: '#999', fontSize: 13 }}>{o.email}</span>}
        <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none', color: '#4ade80' }}>
          <MessageCircle size={13} /> Escribirle
        </a>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, color: '#aaa', fontSize: 13 }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {o.delivery === 'envio' ? <Truck size={14} /> : <Store size={14} />}
          {o.delivery === 'envio' ? `Envío a ${o.address ?? ''}${o.city ? `, ${o.city}` : ''}` : 'Retira en el local'}
        </span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Pay size={14} /> {PAYMENT[o.payment].label}
        </span>
      </div>
      {o.notes && <div style={{ marginTop: 8, fontSize: 13, color: '#ccc', background: '#222', borderRadius: 8, padding: '8px 10px' }}>“{o.notes}”</div>}
      <div style={{ marginTop: 12, borderTop: '1px solid #2a2a2a', paddingTop: 10, display: 'grid', gap: 4 }}>
        {o.items.map((i) => (
          <div key={i.code} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#ccc' }}>
            <span style={{ color: '#FE4806', fontWeight: 700, minWidth: 28 }}>{i.qty} x</span>
            <span style={{ flex: 1 }}>
              {i.name} <span style={{ color: '#666' }}>· {i.code}</span>
            </span>
            <span>{money(i.subtotal)}</span>
          </div>
        ))}
        {o.discount > 0 && (
          <div style={{ display: 'flex', fontSize: 13, color: '#4ade80' }}>
            <span style={{ flex: 1 }}>Descuento por transferencia</span>
            <span>−{money(o.discount)}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <select
          className="input-field"
          style={{ width: 'auto', minWidth: 200 }}
          value={o.status}
          onChange={(e) => onChange({ status: e.target.value as WebOrderStatus })}
          aria-label="Estado del pedido"
        >
          {(Object.keys(STATUS) as WebOrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </select>
        <input
          key={o.adminNotes ?? ''}
          className="input-field"
          style={{ flex: 1, minWidth: 200 }}
          defaultValue={o.adminNotes ?? ''}
          placeholder="Nota interna (solo la ven ustedes)"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (o.adminNotes ?? '')) onChange({ adminNotes: v || null });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    </div>
  );
}

// ─── Productos en la web ────────────────────────────────────────────────────────

const PAGE = 60;

/** Achica la foto en el navegador (lado mayor 1000 px, fondo blanco) para que la tienda cargue rápido. */
async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la foto.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await toBlob('image/webp', 0.86);
  if (webp && webp.type === 'image/webp') return webp;
  const jpg = await toBlob('image/jpeg', 0.88);
  if (!jpg) throw new Error('No se pudo procesar la foto.');
  return jpg;
}

export function ProductosWebPanel({ token }: { token: string }) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'published' | 'all'>('published');
  const [data, setData] = useState<{ categories: WebCategory[]; products: WebProduct[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState({ key: '', n: PAGE });
  const [busyImage, setBusyImage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(
      () => {
        setLoading(true);
        fetchWebProducts(token, q.trim(), only)
          .then((d) => {
            if (cancelled) return;
            setData(d);
            setError('');
          })
          .catch((e) => !cancelled && setError(errMsg(e)))
          .finally(() => !cancelled && setLoading(false));
      },
      q ? 300 : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [token, q, only]);

  const key = `${q}|${only}`;
  const shown = page.key === key ? page.n : PAGE;
  const products = data?.products ?? [];
  const publishedCount = products.filter((p) => p.published).length;

  async function patch(code: string, p: WebProductPatch, local: Partial<WebProduct>) {
    const before = products.find((x) => x.code === code);
    setData((d) => d && { ...d, products: d.products.map((x) => (x.code === code ? { ...x, ...local } : x)) });
    try {
      await updateWebProduct(token, code, p);
      setError('');
    } catch (e) {
      setError(errMsg(e));
      if (before) setData((d) => d && { ...d, products: d.products.map((x) => (x.code === code ? before : x)) });
    }
  }

  function pickImage(code: string) {
    imageFor.current = code;
    fileInput.current?.click();
  }

  async function onFile(file: File | undefined) {
    const code = imageFor.current;
    if (!file || !code) return;
    setBusyImage(code);
    try {
      const blob = await prepareImage(file);
      await uploadWebProductImage(token, code, blob);
      const url = URL.createObjectURL(blob);
      setData((d) => d && { ...d, products: d.products.map((x) => (x.code === code ? { ...x, image: url } : x)) });
      setError('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyImage(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 14px', maxWidth: 820 }}>
        Acá elegís qué productos del catálogo se ven en la tienda online. El precio es el mismo del catálogo (con IVA); si le ponés una oferta, la web muestra
        el precio tachado y el descuento. Los cambios se ven en la tienda en un minuto.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 460 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#666' }} />
          <input
            className="input-field"
            style={{ paddingLeft: 32 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={only === 'published' ? 'Buscar en los publicados…' : 'Buscar en todo el catálogo (nombre, código, proveedor)…'}
          />
        </div>
        <button className={only === 'published' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => setOnly('published')}>
          Publicados
        </button>
        <button className={only === 'all' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => setOnly('all')}>
          Todo el catálogo
        </button>
        <span style={{ color: '#777', fontSize: 12 }}>
          {loading ? 'Buscando…' : only === 'published' ? `${products.length}${products.length >= 500 ? '+' : ''} publicados` : `${products.length}${products.length >= 500 ? '+' : ''} productos · ${publishedCount} publicados`}
        </span>
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
      <datalist id="tienda-marcas">
        {BRANDS.map((b) => (
          <option key={b.name} value={b.name} />
        ))}
      </datalist>
      {data && products.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: 14, padding: 30 }}>
          {only === 'published' && !q ? 'Todavía no hay productos publicados.' : 'No se encontraron productos.'}
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {products.slice(0, shown).map((p) => (
          <ProductRow
            key={p.code}
            product={p}
            categories={data?.categories ?? []}
            busyImage={busyImage === p.code}
            onPatch={(patchBody, local) => patch(p.code, patchBody, local)}
            onPickImage={() => pickImage(p.code)}
          />
        ))}
      </div>
      {products.length > shown && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn-secondary" onClick={() => setPage({ key, n: shown + PAGE })}>
            Ver más ({products.length - shown} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product: p,
  categories,
  busyImage,
  onPatch,
  onPickImage,
}: {
  product: WebProduct;
  categories: WebCategory[];
  busyImage: boolean;
  onPatch: (patch: WebProductPatch, local: Partial<WebProduct>) => void;
  onPickImage: () => void;
}) {
  const final = offerPrice(p.price, p.offerPct);
  const name = p.webName ?? p.description;
  return (
    <div className="card" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: p.published ? 1 : 0.75 }}>
      <button
        type="button"
        onClick={onPickImage}
        title={p.image ? 'Cambiar la foto' : 'Subir una foto'}
        style={{
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: 10,
          border: '1px solid #333',
          background: '#fff',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          overflow: 'hidden',
          padding: 0,
          position: 'relative',
        }}
      >
        {p.image ? (
          <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
        ) : (
          <Camera size={20} style={{ color: '#999' }} />
        )}
        {busyImage && <span style={{ position: 'absolute', inset: 0, background: '#000a', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>Subiendo…</span>}
      </button>

      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <input
          key={`n-${name}`}
          className="input-field"
          style={{ padding: '6px 10px', fontSize: 13, fontWeight: 600 }}
          defaultValue={name}
          title="Nombre en la tienda"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v || v === name) {
              e.target.value = name;
              return;
            }
            onPatch({ name: v === p.description ? null : v }, { webName: v === p.description ? null : v });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <div
          style={{ fontSize: 11, color: '#777', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={p.webName ? `En el catálogo: ${p.description}` : undefined}
        >
          {p.code}
          {p.supplier ? ` · ${p.supplier}` : ''}
          {p.webName ? ` · en el catálogo: ${p.description}` : ''}
        </div>
      </div>

      <input
        key={`b-${p.brand ?? ''}`}
        className="input-field"
        list="tienda-marcas"
        style={{ width: 110, padding: '6px 10px', fontSize: 13 }}
        defaultValue={p.brand ?? ''}
        placeholder="Marca"
        title="Marca"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (p.brand ?? '')) onPatch({ brand: v || null }, { brand: v || null });
        }}
      />

      <select
        className="input-field"
        style={{ width: 170, padding: '6px 8px', fontSize: 13, borderColor: p.published && !p.category ? '#FE4806' : undefined }}
        value={p.category ?? ''}
        title="Categoría en la tienda"
        onChange={(e) => onPatch({ category: e.target.value || null }, { category: e.target.value || null })}
      >
        <option value="">Sin categoría</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Descuento de oferta (%)">
        <input
          key={`o-${p.offerPct ?? ''}`}
          className="input-field"
          inputMode="decimal"
          style={{ width: 56, padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
          defaultValue={p.offerPct ?? ''}
          placeholder="0"
          onBlur={(e) => {
            const raw = e.target.value.replace(',', '.').trim();
            const n = raw === '' ? 0 : Number(raw);
            if (!Number.isFinite(n) || n < 0 || n > 90) {
              e.target.value = String(p.offerPct ?? '');
              return;
            }
            const v = n > 0 ? Math.round(n * 100) / 100 : null;
            if (v !== (p.offerPct ?? null)) onPatch({ offerPct: v }, { offerPct: v });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span style={{ color: '#777', fontSize: 12 }}>% off</span>
      </div>

      <div style={{ width: 100, textAlign: 'right' }}>
        {p.offerPct ? <div style={{ fontSize: 11, color: '#777', textDecoration: 'line-through' }}>{money(p.price)}</div> : null}
        <div style={{ fontSize: 15, fontWeight: 700, color: p.offerPct ? '#4ade80' : '#fff' }}>{money(final)}</div>
      </div>

      <button
        type="button"
        className="btn-secondary"
        title={p.featured ? 'Destacado en la portada' : 'Destacar en la portada'}
        style={{ padding: '6px 9px', color: p.featured ? '#facc15' : '#777' }}
        onClick={() => onPatch({ featured: !p.featured }, { featured: !p.featured })}
      >
        <Star size={15} fill={p.featured ? '#facc15' : 'none'} />
      </button>

      <button
        type="button"
        className={p.published ? 'btn-primary' : 'btn-secondary'}
        style={{ padding: '6px 12px', fontSize: 12, minWidth: 96, justifyContent: 'center' }}
        onClick={() => onPatch({ published: !p.published }, { published: !p.published })}
      >
        {p.published ? 'Publicado' : 'Publicar'}
      </button>
    </div>
  );
}

// ─── Ajustes ────────────────────────────────────────────────────────────────────

export function AjustesTiendaPanel({ token }: { token: string }) {
  const [s, setS] = useState<WebSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWebSettings(token)
      .then((v) => alive && setS(v))
      .catch((e) => alive && setMsg({ ok: false, text: errMsg(e) }));
    return () => {
      alive = false;
    };
  }, [token]);

  async function save() {
    if (!s) return;
    setSaving(true);
    setMsg(null);
    try {
      await saveWebSettings(token, { ...s, whatsapp: s.whatsapp.replace(/\D/g, '') });
      setMsg({ ok: true, text: 'Guardado. La tienda lo muestra en un minuto.' });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <div style={{ color: msg ? '#f87171' : '#777', fontSize: 14 }}>{msg?.text ?? 'Cargando…'}</div>;

  return (
    <div className="card" style={{ maxWidth: 640, display: 'grid', gap: 16 }}>
      <div>
        <label>Cuotas sin interés que muestra la tienda</label>
        <select className="input-field" style={{ width: 220 }} value={s.cuotas} onChange={(e) => setS({ ...s, cuotas: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 9, 12, 18, 24].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'Sin cuotas (un pago)' : `${n} cuotas sin interés`}
            </option>
          ))}
        </select>
        <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>
          Ojo: las cuotas sin interés las absorbe el negocio (la financiación la cobra la plataforma de pago). Mostrá solo las que puedas ofrecer de verdad.
        </div>
      </div>
      <div>
        <label>Descuento pagando por transferencia (%)</label>
        <input
          className="input-field"
          style={{ width: 120 }}
          inputMode="decimal"
          value={s.transferPct}
          onChange={(e) => {
            const n = Number(e.target.value.replace(',', '.'));
            if (e.target.value === '' || (Number.isFinite(n) && n >= 0 && n <= 50)) setS({ ...s, transferPct: e.target.value === '' ? 0 : n });
          }}
        />
        <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>Con 0 no se muestra ningún descuento. Si ponés, por ejemplo, 10, cada producto muestra también su precio por transferencia.</div>
      </div>
      <div>
        <label>WhatsApp de la tienda</label>
        <input className="input-field" style={{ width: 240 }} value={s.whatsapp} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} />
        <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>Con 549 y la característica, sin espacios ni el 15. Ejemplo: 5492604696700.</div>
      </div>
      <div>
        <label>Texto de envíos y retiro</label>
        <textarea className="input-field" rows={3} value={s.shippingNote} maxLength={300} onChange={(e) => setS({ ...s, shippingNote: e.target.value })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? '#4ade80' : '#f87171' }}>{msg.text}</span>}
      </div>
    </div>
  );
}
