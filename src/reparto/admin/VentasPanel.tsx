import { useEffect, useMemo, useState } from 'react';
import { Plus, ShoppingCart, Trash2, Printer, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { createSale, deleteSale, fetchCatalog, fetchStaffList, subscribeClients, subscribeSales } from '../api';
import { downloadSaleDocPdf, printSaleDoc } from '../printSaleDoc';
import ProductItemPicker from '../shared/ProductItemPicker';
import type { CatalogProduct, FieldClient, Sale, Staff, StreetOrderItem } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function VentasPanel({ token }: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<FieldClient | null>(null);
  const [courierId, setCourierId] = useState('');
  const [items, setItems] = useState<StreetOrderItem[]>([]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [courierFilter, setCourierFilter] = useState('todos');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => subscribeSales(token, setSales), [token]);
  useEffect(() => subscribeClients(token, setClients), [token]);
  useEffect(() => { fetchStaffList(token).then(setStaff).catch(() => {}); }, [token]);
  useEffect(() => { fetchCatalog(token).then(setCatalog).catch(() => {}); }, [token]);

  const couriers = useMemo(() => staff.filter((s) => s.role === 'repartidor'), [staff]);
  const courierNames = useMemo(() => Array.from(new Set(sales.map((s) => s.courierName))), [sales]);

  const suggestions = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 6);
  }, [clients, clientQuery]);

  const filtered = useMemo(
    () => sales.filter((s) => courierFilter === 'todos' || s.courierName === courierFilter),
    [sales, courierFilter]
  );

  function openAdd() {
    setSelectedClient(null);
    setClientQuery('');
    setCourierId('');
    setItems([]);
    setDescription('');
    setError('');
    setShowForm(true);
  }

  async function submit() {
    const courier = couriers.find((c) => c.id === courierId);
    if (!selectedClient) { setError('Elegí un cliente.'); return; }
    if (!courier) { setError('Elegí un repartidor.'); return; }
    if (items.length === 0) { setError('Agregá al menos un producto.'); return; }
    try {
      await createSale(token, {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        courierId: courier.id,
        courierName: courier.name,
        description: description.trim() || undefined,
        items,
      });
      setShowForm(false);
      fetchCatalog(token).then(setCatalog).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la venta.');
    }
  }

  async function remove(s: Sale) {
    if (!confirm(`¿Eliminar la venta de ${fmt(s.amount)} a ${s.clientName}?`)) return;
    await deleteSale(token, s.id);
    fetchCatalog(token).then(setCatalog).catch(() => {});
  }

  function printSale(s: Sale) {
    printSaleDoc({
      title: 'Venta',
      fileNameBase: `venta-${s.id}`,
      clientName: s.clientName,
      staffName: s.courierName,
      items: s.items,
      total: s.amount,
      notes: s.description,
      createdAt: s.createdAt,
    });
  }

  function downloadSale(s: Sale) {
    void downloadSaleDocPdf({
      title: 'Venta',
      fileNameBase: `venta-${s.id}`,
      clientName: s.clientName,
      staffName: s.courierName,
      items: s.items,
      total: s.amount,
      notes: s.description,
      createdAt: s.createdAt,
    });
  }

  const total = filtered.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ShoppingCart size={22} color="#FFE000" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(total)}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{filtered.length} venta{filtered.length !== 1 ? 's' : ''} cargada{filtered.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Cargar venta</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label>Cliente</label>
          {selectedClient ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d2d1a', border: '1px solid #4ade8033', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <div>
                <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>{selectedClient.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{selectedClient.address}</div>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedClient(null)}>Cambiar</button>
            </div>
          ) : (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input className="input-field" placeholder="Buscar por nombre o dirección..." value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
              {suggestions.length > 0 && (
                <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
                  {suggestions.map((c) => (
                    <div key={c.id} onClick={() => { setSelectedClient(c); setClientQuery(''); }} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>
                      <div style={{ color: '#fff', fontSize: 13 }}>{c.name}</div>
                      <div style={{ color: '#666', fontSize: 12 }}>{c.address}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <label>Repartidor</label>
          <select className="input-field" value={courierId} onChange={(e) => setCourierId(e.target.value)} style={{ marginBottom: 14 }}>
            <option value="">Elegir...</option>
            {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <ProductItemPicker catalog={catalog} items={items} onItemsChange={setItems} />

          <label style={{ marginTop: 14 }}>Nota (opcional)</label>
          <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ej: entrega en depósito" />

          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={submit}>Cargar venta</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <select className="input-field" style={{ width: 220 }} value={courierFilter} onChange={(e) => setCourierFilter(e.target.value)}>
          <option value="todos">Todos los repartidores</option>
          {courierNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay ventas cargadas todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((s) => (
            <div key={s.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 2, flexShrink: 0 }}
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                >
                  {expanded === s.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{s.clientName}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>
                    {s.courierName} · {s.items.length} ítem{s.items.length !== 1 ? 's' : ''}{s.description ? ` · ${s.description}` : ''} · {fmtDate(s.createdAt)}
                  </div>
                </div>
                <div style={{ color: '#FFE000', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{fmt(s.amount)}</div>
                <button className="btn-secondary" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => printSale(s)}><Printer size={13} /></button>
                <button className="btn-secondary" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => downloadSale(s)}><Download size={13} /></button>
                <button className="btn-danger" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => remove(s)}><Trash2 size={13} /></button>
              </div>
              {expanded === s.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2d2d2d', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#ccc' }}>
                      <span>{it.quantity} × {it.description}</span>
                      <span style={{ color: '#999' }}>{fmt(it.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
