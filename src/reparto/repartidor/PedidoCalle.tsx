import { useEffect, useMemo, useState } from 'react';
import { Plus, Send, Trash2, PackageCheck } from 'lucide-react';
import { sameStreet } from '../address';
import { createStreetOrder, fetchCatalog, subscribeClients, updateStreetOrderStatus } from '../api';
import type { CatalogProduct, FieldClient, Session, StreetOrder, StreetOrderItem } from '../types';

interface Props {
  session: Session;
  orders: StreetOrder[];
  onOrderCreated: (order: StreetOrder) => void;
  onOrderChanged: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<StreetOrder['status'], string> = {
  pendiente: 'Pendiente',
  visto: 'Visto por el local',
  nota: 'Con nota del local',
  armado: 'Armado, listo para retirar',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
};

export default function PedidoCalle({ session, orders, onOrderCreated, onOrderChanged }: Props) {
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  useEffect(() => subscribeClients(session.token, setClients), [session.token]);
  useEffect(() => { fetchCatalog(session.token).then(setCatalog).catch(() => {}); }, [session.token]);

  const [streetLabel, setStreetLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<StreetOrderItem[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [clientQuery, setClientQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<FieldClient | null>(null);

  const [productQuery, setProductQuery] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selectedCode, setSelectedCode] = useState<string | undefined>();

  const clientSuggestions = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 6);
  }, [clientQuery, clients]);

  const productSuggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog.filter((p) => p.description.toLowerCase().includes(q)).slice(0, 6);
  }, [productQuery, catalog]);

  const nearbyClients = useMemo(() => {
    if (!streetLabel.trim()) return [];
    return clients
      .filter((c) => c.id !== selectedClient?.id && sameStreet(c.address, streetLabel))
      .map((c) => ({ name: c.name, address: c.address }));
  }, [clients, streetLabel, selectedClient]);

  const total = useMemo(() => items.reduce((sum, it) => sum + it.subtotal, 0), [items]);

  const myOrders = useMemo(
    () =>
      orders
        .filter((o) => o.courierId === session.staff.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10),
    [orders, session.staff.id]
  );

  function pickClient(c: FieldClient) {
    setSelectedClient(c);
    setClientQuery('');
    if (!streetLabel.trim()) setStreetLabel(c.address);
  }

  function pickProduct(p: CatalogProduct) {
    setProductQuery(p.description);
    setUnitPrice(String(p.unitPrice));
    setSelectedCode(p.code);
  }

  function addItem() {
    const description = productQuery.trim();
    const price = Number(unitPrice.replace(',', '.'));
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    if (!description) {
      setError('Escribí qué producto es.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Ingresá un precio unitario válido.');
      return;
    }
    setError('');
    setItems((prev) => [
      ...prev,
      { code: selectedCode, description, quantity: qty, unitPrice: price, subtotal: Math.round(price * qty * 100) / 100 },
    ]);
    setProductQuery('');
    setUnitPrice('');
    setQuantity('1');
    setSelectedCode(undefined);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError('');
    if (!streetLabel.trim()) {
      setError('Indicá la calle de referencia.');
      return;
    }
    if (items.length === 0) {
      setError('Agregá al menos un producto.');
      return;
    }
    setSending(true);
    try {
      const order = await createStreetOrder(session.token, {
        streetKey: streetLabel.trim().toLowerCase(),
        streetLabel: streetLabel.trim(),
        courierId: session.staff.id,
        courierName: session.staff.name,
        items,
        total,
        notes: notes.trim() || undefined,
        nearbyClients,
        clientName: selectedClient?.name,
        status: 'pendiente',
      });
      onOrderCreated(order);
      setItems([]);
      setNotes('');
      setSelectedClient(null);
      setStreetLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el pedido.');
    } finally {
      setSending(false);
    }
  }

  async function markPickedUp(id: string) {
    await updateStreetOrderStatus(session.token, id, 'retirado');
    onOrderChanged();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <label>Cliente (opcional)</label>
        {selectedClient ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d2d1a', border: '1px solid #4ade8033', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>{selectedClient.name}</div>
              <div style={{ color: '#888', fontSize: 12 }}>{selectedClient.address}</div>
            </div>
            <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedClient(null)}>Cambiar</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input className="input-field" placeholder="Buscar por nombre o dirección..." value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
            {clientSuggestions.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
                {clientSuggestions.map((c) => (
                  <div key={c.id} onClick={() => pickClient(c)} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#2d2d2d')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ color: '#fff', fontSize: 13 }}>{c.name}</div>
                    <div style={{ color: '#666', fontSize: 12 }}>{c.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <label style={{ marginTop: 14 }}>Calle de referencia</label>
        <input className="input-field" placeholder="Ej: Av. San Martín 1200" value={streetLabel} onChange={(e) => setStreetLabel(e.target.value)} />
        {nearbyClients.length > 0 && (
          <div style={{ marginTop: 8, background: '#2d2500', border: '1px solid #FFE00033', borderRadius: 10, padding: 10 }}>
            <div style={{ color: '#FFE000', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Otros clientes de la ruta en esa calle</div>
            {nearbyClients.map((c) => (
              <div key={c.name + c.address} style={{ color: '#ccc', fontSize: 12 }}>· {c.name} — {c.address}</div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agregar producto</div>
        <label>Producto</label>
        <div style={{ position: 'relative' }}>
          <input className="input-field" placeholder="Buscar en el catálogo o escribir manualmente..." value={productQuery}
            onChange={(e) => { setProductQuery(e.target.value); setSelectedCode(undefined); }} />
          {productSuggestions.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
              {productSuggestions.map((p) => (
                <div key={p.code} onClick={() => pickProduct(p)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2d2d2d')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ color: '#fff', fontSize: 13 }}>{p.description}</span>
                  <span style={{ color: '#FFE000', fontWeight: 600, fontSize: 13 }}>{fmt(p.unitPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label>Precio unitario</label>
            <input className="input-field" inputMode="decimal" placeholder="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <label>Cantidad</label>
            <input className="input-field" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <button className="btn-secondary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={addItem}>
          <Plus size={14} /> Agregar al pedido
        </button>
      </div>

      {items.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ítems del pedido</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', padding: '8px 12px', borderRadius: 8 }}>
                <span style={{ flex: 1, fontSize: 13, color: '#fff' }}>{it.quantity} × {it.description}</span>
                <span style={{ color: '#FFE000', fontWeight: 600, fontSize: 13 }}>{fmt(it.subtotal)}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }} onClick={() => removeItem(i)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', marginTop: 10, fontSize: 16, fontWeight: 700, color: '#FFE000' }}>Total: {fmt(total)}</div>
        </div>
      )}

      <div className="card">
        <label>Notas para el local (opcional)</label>
        <textarea className="input-field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: dejar en depósito / factura a nombre de..." style={{ resize: 'vertical' }} />
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={submit} disabled={sending}>
        <Send size={16} /> {sending ? 'Enviando...' : 'Enviar pedido al local'}
      </button>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mis pedidos al local</div>
        {myOrders.length === 0 ? (
          <p style={{ color: '#666', fontSize: 13 }}>Todavía no enviaste pedidos.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myOrders.map((o) => (
              <div key={o.id} className="card">
                {o.clientName && <div className="badge badge-blue" style={{ marginBottom: 6 }}>{o.clientName}</div>}
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{o.streetLabel} · {fmt(o.total)}</div>
                <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>Estado: {STATUS_LABEL[o.status]}</div>
                {o.status === 'armado' && (
                  <button className="btn-primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => markPickedUp(o.id)}>
                    <PackageCheck size={14} /> Marcar retirado
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
