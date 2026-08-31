import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, Truck, XCircle, Package, DollarSign, FileText } from 'lucide-react';
import type { Remit, RemitStatus, RemitItem, AppData } from '../types';
import { generateId, nextRemitNumber } from '../store';

interface Props { data: AppData; onChange: (d: AppData) => void; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const TODAY = '2026-05-12';

const STATUS_CFG: Record<RemitStatus, { label: string; color: string; bg: string; icon: any }> = {
  borrador:  { label: 'Borrador',  color: '#FFE000', bg: '#2d2500', icon: FileText },
  entregado: { label: 'Entregado', color: '#60a5fa', bg: '#0d1a2d', icon: Truck },
  cobrado:   { label: 'Cobrado',   color: '#4ade80', bg: '#0d2d1a', icon: CheckCircle },
  cancelado: { label: 'Cancelado', color: '#f87171', bg: '#2d0d0d', icon: XCircle },
};

const emptyRemit = (number: string): Omit<Remit, 'id'> => ({
  number, clientId: '', clientName: '', items: [], subtotal: 0,
  discount: 0, total: 0, status: 'borrador', date: TODAY,
  deliveredDate: '', notes: '', routeId: '',
});

export default function Ventas({ data, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Remit | null>(null);
  const [form, setForm] = useState<Omit<Remit, 'id'>>(emptyRemit('R-0001'));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newItemProdId, setNewItemProdId] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');

  const remits = data.remits.filter(r => {
    const q = search.toLowerCase();
    const match = r.number.toLowerCase().includes(q) || r.clientName.toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return match && matchStatus;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const totalBilled = data.remits.filter(r => r.status !== 'cancelado').reduce((s, r) => s + r.total, 0);
  const totalPending = data.remits.filter(r => r.status === 'entregado').reduce((s, r) => s + r.total, 0);
  const counts = { borrador: 0, entregado: 0, cobrado: 0, cancelado: 0 };
  data.remits.forEach(r => counts[r.status]++);

  function recalc(items: RemitItem[], discount: number) {
    const sub = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    return { subtotal: sub, total: Math.max(0, sub - discount) };
  }

  function openAdd() {
    setEditing(null);
    const number = nextRemitNumber(data.remits);
    setForm(emptyRemit(number));
    setNewItemProdId('');
    setNewItemQty('1');
    setShowModal(true);
  }

  function openEdit(r: Remit) {
    setEditing(r);
    setForm({ number: r.number, clientId: r.clientId, clientName: r.clientName, items: [...r.items], subtotal: r.subtotal, discount: r.discount, total: r.total, status: r.status, date: r.date, deliveredDate: r.deliveredDate, notes: r.notes, routeId: r.routeId });
    setNewItemProdId('');
    setNewItemQty('1');
    setShowModal(true);
  }

  function handleClientSelect(clientId: string) {
    const client = data.clients.find(c => c.id === clientId);
    setForm(f => ({ ...f, clientId, clientName: client?.name || '', routeId: client?.routeId || '' }));
  }

  function addItem() {
    const prod = data.products.find(p => p.id === newItemProdId);
    if (!prod) return;
    const qty = Math.max(1, Number(newItemQty));
    const newItem: RemitItem = { productId: prod.id, productName: prod.name, quantity: qty, unitPrice: prod.salePrice };
    const newItems = [...form.items, newItem];
    const { subtotal, total } = recalc(newItems, form.discount);
    setForm(f => ({ ...f, items: newItems, subtotal, total }));
    setNewItemProdId('');
    setNewItemQty('1');
  }

  function removeItem(idx: number) {
    const newItems = form.items.filter((_, i) => i !== idx);
    const { subtotal, total } = recalc(newItems, form.discount);
    setForm(f => ({ ...f, items: newItems, subtotal, total }));
  }

  function handleDiscountChange(val: number) {
    const { subtotal, total } = recalc(form.items, val);
    setForm(f => ({ ...f, discount: val, subtotal, total }));
  }

  function handleSave() {
    if (editing) {
      const wasEntregado = editing.status !== 'entregado' && form.status === 'entregado';
      const wasCobrado = editing.status !== 'cobrado' && form.status === 'cobrado';
      let { products, clients } = data;

      // Deduct stock when marking as entregado
      if (wasEntregado) {
        products = products.map(p => {
          const item = form.items.find(i => i.productId === p.id);
          return item ? { ...p, stock: Math.max(0, p.stock - item.quantity), updatedAt: TODAY } : p;
        });
        if (form.deliveredDate === '') form.deliveredDate = TODAY;
      }

      // Add to client balance when entregado
      if (wasEntregado || wasCobrado) {
        clients = clients.map(c => {
          if (c.id !== form.clientId) return c;
          if (wasEntregado) return { ...c, currentBalance: c.currentBalance + form.total };
          if (wasCobrado) return { ...c, currentBalance: Math.max(0, c.currentBalance - form.total) };
          return c;
        });
      }

      // If previously entregado and now cobrado, clear from balance
      if (editing.status === 'entregado' && form.status === 'cobrado') {
        clients = clients.map(c => c.id === form.clientId
          ? { ...c, currentBalance: Math.max(0, c.currentBalance - form.total) } : c);
      }

      onChange({ ...data, products, clients, remits: data.remits.map(r => r.id === editing.id ? { ...r, ...form } : r) });
    } else {
      const newR: Remit = { ...form, id: generateId() };
      onChange({ ...data, remits: [...data.remits, newR] });
    }
    setShowModal(false);
  }

  function quickStatus(id: string, newStatus: RemitStatus) {
    const remit = data.remits.find(r => r.id === id);
    if (!remit) return;
    let { products, clients } = data;

    if (remit.status !== 'entregado' && newStatus === 'entregado') {
      products = products.map(p => {
        const item = remit.items.find(i => i.productId === p.id);
        return item ? { ...p, stock: Math.max(0, p.stock - item.quantity), updatedAt: TODAY } : p;
      });
      clients = clients.map(c => c.id === remit.clientId ? { ...c, currentBalance: c.currentBalance + remit.total } : c);
    }
    if (remit.status === 'entregado' && newStatus === 'cobrado') {
      clients = clients.map(c => c.id === remit.clientId ? { ...c, currentBalance: Math.max(0, c.currentBalance - remit.total) } : c);
    }

    const updatedRemit = { ...remit, status: newStatus, deliveredDate: newStatus === 'entregado' && !remit.deliveredDate ? TODAY : remit.deliveredDate };
    onChange({ ...data, products, clients, remits: data.remits.map(r => r.id === id ? updatedRemit : r) });
  }

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Ventas / Remitos</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{data.remits.length} remitos registrados</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Nuevo Remito</button>
      </div>

      {/* Status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        {(Object.entries(STATUS_CFG) as [RemitStatus, typeof STATUS_CFG[RemitStatus]][]).map(([status, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={status} style={{ background: cfg.bg, border: `1px solid ${cfg.color}22`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={18} color={cfg.color} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: cfg.color }}>{counts[status]}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{cfg.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total facturado</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#FFE000' }}>{fmt(totalBilled)}</div>
        </div>
        <div style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Pendiente de cobro</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fb923c' }}>{fmt(totalPending)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por número o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Cliente</th>
              <th>Ruta</th>
              <th>Fecha</th>
              <th>Items</th>
              <th style={{ textAlign: 'right' }}>Descuento</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {remits.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#555', padding: 40 }}>
                <Package size={32} color="#333" style={{ margin: '0 auto 8px', display: 'block' }} />
                No se encontraron remitos
              </td></tr>
            )}
            {remits.map(r => {
              const s = STATUS_CFG[r.status];
              const Icon = s.icon;
              const route = data.routes.find(rt => rt.id === r.routeId);
              return (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#FFE000' }}>{r.number}</td>
                  <td>
                    <div style={{ fontWeight: 500, color: '#fff' }}>{r.clientName}</div>
                    {r.notes && <div style={{ fontSize: 11, color: '#555' }}>{r.notes.slice(0, 35)}{r.notes.length > 35 ? '…' : ''}</div>}
                  </td>
                  <td>
                    {route ? <span className="badge badge-gray" style={{ borderColor: route.color + '44', color: route.color }}>{route.name}</span> : <span style={{ color: '#444' }}>—</span>}
                  </td>
                  <td style={{ color: '#aaa' }}>{r.date}</td>
                  <td style={{ color: '#888' }}>{r.items.length} {r.items.length === 1 ? 'item' : 'items'}</td>
                  <td style={{ textAlign: 'right', color: r.discount > 0 ? '#fb923c' : '#444' }}>
                    {r.discount > 0 ? `-${fmt(r.discount)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{fmt(r.total)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon size={13} color={s.color} />
                      <span style={{ color: s.color, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.status === 'borrador' && (
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => quickStatus(r.id, 'entregado')}>
                          <Truck size={12} /> Entregar
                        </button>
                      )}
                      {r.status === 'entregado' && (
                        <button className="btn-primary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => quickStatus(r.id, 'cobrado')}>
                          <DollarSign size={12} /> Cobrar
                        </button>
                      )}
                      <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => openEdit(r)}><Edit2 size={13} /></button>
                      <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => setDeleteId(r.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#fff', fontSize: 18 }}>{editing ? `Editar ${editing.number}` : 'Nuevo Remito'}</h2>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#FFE000', fontSize: 16 }}>{form.number}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Cliente *</label>
                <select className="input-field" value={form.clientId} onChange={e => handleClientSelect(e.target.value)}>
                  <option value="">Seleccionar cliente...</option>
                  {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label>Fecha</label>
                <input className="input-field" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label>Estado</label>
                <select className="input-field" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as RemitStatus }))}>
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notas</label>
                <input className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones del remito..." />
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Productos
              </div>

              {form.items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                  {form.items.map((item, i) => {
                    const prod = data.products.find(p => p.id === item.productId);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', padding: '8px 12px', borderRadius: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{item.productName}</div>
                          <div style={{ fontSize: 11, color: '#555' }}>Stock disponible: {prod?.stock ?? '?'}</div>
                        </div>
                        <span style={{ color: '#666', fontSize: 12 }}>×{item.quantity}</span>
                        <span style={{ color: '#aaa', fontSize: 12 }}>{fmt(item.unitPrice)} c/u</span>
                        <span style={{ color: '#FFE000', fontWeight: 700, fontSize: 13, minWidth: 70, textAlign: 'right' }}>{fmt(item.unitPrice * item.quantity)}</span>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }} onClick={() => removeItem(i)}><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add item row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label>Agregar producto</label>
                  <select className="input-field" value={newItemProdId} onChange={e => setNewItemProdId(e.target.value)}>
                    <option value="">Seleccionar producto...</option>
                    {data.products.filter(p => p.stock > 0).map(p => (
                      <option key={p.id} value={p.id}>{p.name} — stock: {p.stock} — {fmt(p.salePrice)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Cant.</label>
                  <input className="input-field" type="number" min={1} value={newItemQty} onChange={e => setNewItemQty(e.target.value)} />
                </div>
                <button className="btn-secondary" onClick={addItem} disabled={!newItemProdId} style={{ marginTop: 18 }}>
                  <Plus size={14} /> Agregar
                </button>
              </div>
            </div>

            {/* Totals */}
            {form.items.length > 0 && (
              <div style={{ background: '#111', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#666', fontSize: 13 }}>Subtotal</span>
                  <span style={{ color: '#aaa', fontSize: 13 }}>{fmt(form.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: '#666', fontSize: 13 }}>Descuento ($)</span>
                  <input className="input-field" type="number" min={0} value={form.discount} onChange={e => handleDiscountChange(Number(e.target.value))} style={{ width: 110, textAlign: 'right' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #2d2d2d', paddingTop: 8, marginTop: 4 }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>Total</span>
                  <span style={{ color: '#FFE000', fontWeight: 800, fontSize: 18 }}>{fmt(form.total)}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.clientId || form.items.length === 0}>
                {editing ? 'Guardar cambios' : 'Crear remito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Trash2 size={40} color="#f87171" style={{ margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ color: '#fff', marginBottom: 8 }}>¿Eliminar remito?</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>El stock y saldo del cliente no se revertirán automáticamente.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => { onChange({ ...data, remits: data.remits.filter(r => r.id !== deleteId) }); setDeleteId(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
