import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, Clock, Truck, XCircle, Package } from 'lucide-react';
import type { Order, OrderStatus, OrderItem, AppData } from '../types';
import { generateId } from '../store';

interface Props { data: AppData; onChange: (d: AppData) => void; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: any }> = {
  pendiente: { label: 'Pendiente', color: '#FFE000', bg: '#2d2500', icon: Clock },
  en_camino: { label: 'En camino', color: '#60a5fa', bg: '#0d1a2d', icon: Truck },
  recibido: { label: 'Recibido', color: '#4ade80', bg: '#0d2d1a', icon: CheckCircle },
  cancelado: { label: 'Cancelado', color: '#f87171', bg: '#2d0d0d', icon: XCircle },
};

const emptyOrder = (): Omit<Order, 'id'> => ({
  supplier: '', items: [], total: 0, status: 'pendiente',
  orderDate: today(), estimatedDate: '', notes: '', invoiceNumber: '', receivedDate: undefined,
});

export default function Pedidos({ data, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [form, setForm] = useState(emptyOrder());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemCost, setNewItemCost] = useState('');

  const orders = data.orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = o.supplier.toLowerCase().includes(q) || o.invoiceNumber.toLowerCase().includes(q);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  function openAdd() {
    setEditing(null);
    setForm(emptyOrder());
    setShowModal(true);
  }

  function openEdit(o: Order) {
    setEditing(o);
    setForm({ supplier: o.supplier, items: [...o.items], total: o.total, status: o.status, orderDate: o.orderDate, estimatedDate: o.estimatedDate, notes: o.notes, invoiceNumber: o.invoiceNumber, receivedDate: o.receivedDate });
    setShowModal(true);
  }

  function addItem() {
    if (!newItemName || !newItemCost) return;
    const item: OrderItem = { productId: '', productName: newItemName, quantity: Number(newItemQty), unitCost: Number(newItemCost) };
    const newItems = [...form.items, item];
    const total = newItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    setForm({ ...form, items: newItems, total });
    setNewItemName(''); setNewItemQty('1'); setNewItemCost('');
  }

  function removeItem(idx: number) {
    const newItems = form.items.filter((_, i) => i !== idx);
    setForm({ ...form, items: newItems, total: newItems.reduce((s, i) => s + i.quantity * i.unitCost, 0) });
  }

  function handleSave() {
    if (editing) {
      onChange({ ...data, orders: data.orders.map(o => o.id === editing.id ? { ...o, ...form } : o) });
    } else {
      const newO: Order = { ...form, id: generateId() };
      onChange({ ...data, orders: [...data.orders, newO] });
    }
    setShowModal(false);
  }

  function changeStatus(id: string, status: OrderStatus) {
    const update: Partial<Order> = { status };
    if (status === 'recibido') {
      update.receivedDate = today();
      const order = data.orders.find(o => o.id === id);
      if (order) {
        const updatedProducts = [...data.products];
        order.items.forEach(item => {
          if (item.productId) {
            const idx = updatedProducts.findIndex(p => p.id === item.productId);
            if (idx >= 0) updatedProducts[idx] = { ...updatedProducts[idx], stock: updatedProducts[idx].stock + item.quantity, updatedAt: today() };
          }
        });
        onChange({ ...data, products: updatedProducts, orders: data.orders.map(o => o.id === id ? { ...o, ...update } : o) });
        return;
      }
    }
    onChange({ ...data, orders: data.orders.map(o => o.id === id ? { ...o, ...update } : o) });
  }

  const counts = { pendiente: 0, en_camino: 0, recibido: 0, cancelado: 0 };
  data.orders.forEach(o => counts[o.status]++);

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Pedidos</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{data.orders.length} pedidos registrados</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Nuevo Pedido</button>
      </div>

      {/* Status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        {(Object.entries(STATUS_CONFIG) as [OrderStatus, typeof STATUS_CONFIG[OrderStatus]][]).map(([status, cfg]) => {
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por proveedor o factura..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 170 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Factura</th>
              <th>Fecha pedido</th>
              <th>Fecha estimada</th>
              <th>Items</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#555', padding: 40 }}>
                <Package size={32} color="#333" style={{ margin: '0 auto 8px', display: 'block' }} />
                No se encontraron pedidos
              </td></tr>
            )}
            {orders.map(o => {
              const s = STATUS_CONFIG[o.status];
              const Icon = s.icon;
              return (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 500, color: '#fff' }}>{o.supplier}</div>
                    {o.notes && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{o.notes.slice(0, 40)}{o.notes.length > 40 ? '...' : ''}</div>}
                  </td>
                  <td style={{ color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{o.invoiceNumber || '-'}</td>
                  <td style={{ color: '#aaa' }}>{o.orderDate}</td>
                  <td style={{ color: '#aaa' }}>{o.status === 'recibido' ? <span style={{ color: '#4ade80' }}>{o.receivedDate}</span> : o.estimatedDate || '-'}</td>
                  <td style={{ color: '#888' }}>{o.items.length} {o.items.length === 1 ? 'item' : 'items'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#fff' }}>{fmt(o.total)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={14} color={s.color} />
                      <span style={{ color: s.color, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {o.status === 'pendiente' && (
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => changeStatus(o.id, 'en_camino')}>
                          <Truck size={12} /> Enviar
                        </button>
                      )}
                      {o.status === 'en_camino' && (
                        <button className="btn-primary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => changeStatus(o.id, 'recibido')}>
                          <CheckCircle size={12} /> Recibir
                        </button>
                      )}
                      <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => openEdit(o)}><Edit2 size={13} /></button>
                      <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => setDeleteId(o.id)}><Trash2 size={13} /></button>
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
          <div className="modal-content" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 20, fontSize: 18 }}>{editing ? 'Editar Pedido' : 'Nuevo Pedido'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Proveedor *</label>
                <input className="input-field" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Nombre del proveedor" />
              </div>
              <div>
                <label>Número de factura</label>
                <input className="input-field" value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="A-00001" />
              </div>
              <div>
                <label>Estado</label>
                <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as OrderStatus })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label>Fecha del pedido</label>
                <input className="input-field" type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} />
              </div>
              <div>
                <label>Fecha estimada de llegada</label>
                <input className="input-field" type="date" value={form.estimatedDate} onChange={e => setForm({ ...form, estimatedDate: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notas</label>
                <textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones..." style={{ resize: 'vertical' }} />
              </div>
            </div>

            {/* Items */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Items del pedido</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {form.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', padding: '8px 12px', borderRadius: 8 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#fff' }}>{item.productName}</span>
                    <span style={{ color: '#666', fontSize: 12 }}>×{item.quantity}</span>
                    <span style={{ color: '#FFE000', fontWeight: 600, fontSize: 13 }}>{fmt(item.unitCost * item.quantity)}</span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }} onClick={() => removeItem(i)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label>Descripción del item</label>
                  <input className="input-field" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Nombre del producto" />
                </div>
                <div>
                  <label>Cant.</label>
                  <input className="input-field" type="number" min={1} value={newItemQty} onChange={e => setNewItemQty(e.target.value)} />
                </div>
                <div>
                  <label>Costo unit. ($)</label>
                  <input className="input-field" type="number" min={0} value={newItemCost} onChange={e => setNewItemCost(e.target.value)} placeholder="0" />
                </div>
                <button className="btn-secondary" onClick={addItem} style={{ marginTop: 18 }}><Plus size={14} /></button>
              </div>
              {form.items.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 15, fontWeight: 700, color: '#FFE000' }}>
                  Total: {fmt(form.total)}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.supplier}>{editing ? 'Guardar cambios' : 'Crear pedido'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Trash2 size={40} color="#f87171" style={{ margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ color: '#fff', marginBottom: 8 }}>¿Eliminar pedido?</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => { onChange({ ...data, orders: data.orders.filter(o => o.id !== deleteId) }); setDeleteId(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
