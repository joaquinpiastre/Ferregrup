import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Wrench, Store, ChevronDown, ChevronUp, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import type { Client, ClientCategory, AppData } from '../types';
import { generateId } from '../store';

interface Props { data: AppData; onChange: (d: AppData) => void; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const TODAY = '2026-05-12';

const CAT_CONFIG: Record<ClientCategory, { label: string; color: string; icon: any }> = {
  taller:     { label: 'Taller', color: '#fb923c', icon: Wrench },
  ferreteria: { label: 'Ferretería', color: '#60a5fa', icon: Store },
  otro:       { label: 'Otro', color: '#9ca3af', icon: Store },
};

const emptyClient = (): Omit<Client, 'id' | 'createdAt' | 'currentBalance'> => ({
  name: '', category: 'taller', contact: '', phone: '', email: '',
  address: '', zone: '', cuit: '', creditLimit: 0, routeId: '', notes: '',
});

export default function Clientes({ data, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const clients = data.clients.filter(c => {
    const q = search.toLowerCase();
    const match = c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q) || c.phone.includes(q) || c.zone.toLowerCase().includes(q);
    const matchCat = !catFilter || c.category === catFilter;
    return match && matchCat;
  });

  const totalReceivable = data.clients.reduce((s, c) => s + c.currentBalance, 0);
  const talleres = data.clients.filter(c => c.category === 'taller').length;
  const ferreterias = data.clients.filter(c => c.category === 'ferreteria').length;

  function openAdd() {
    setEditing(null);
    setForm(emptyClient());
    setShowModal(true);
  }

  function openEdit(c: Client) {
    setEditing(c);
    setForm({ name: c.name, category: c.category, contact: c.contact, phone: c.phone, email: c.email, address: c.address, zone: c.zone, cuit: c.cuit, creditLimit: c.creditLimit, routeId: c.routeId, notes: c.notes });
    setShowModal(true);
  }

  function handleSave() {
    if (editing) {
      onChange({ ...data, clients: data.clients.map(c => c.id === editing.id ? { ...c, ...form } : c) });
    } else {
      const newC: Client = { ...form, id: generateId(), currentBalance: 0, createdAt: TODAY };
      onChange({ ...data, clients: [...data.clients, newC] });
    }
    setShowModal(false);
  }

  function handleDelete(id: string) {
    onChange({ ...data, clients: data.clients.filter(c => c.id !== id) });
    setDeleteId(null);
  }

  const getRoute = (routeId: string) => data.routes.find(r => r.id === routeId);
  const getClientRemits = (clientId: string) => data.remits.filter(r => r.clientId === clientId);

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Clientes</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{data.clients.length} clientes de distribución</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Nuevo Cliente</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <MiniStat label="Saldo total a cobrar" value={fmt(totalReceivable)} color="#FFE000" />
        <MiniStat label="Talleres" value={`${talleres} clientes`} color="#fb923c" />
        <MiniStat label="Ferreterías" value={`${ferreterias} clientes`} color="#60a5fa" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por nombre, contacto, zona..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 160 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="taller">Talleres</option>
          <option value="ferreteria">Ferreterías</option>
          <option value="otro">Otros</option>
        </select>
      </div>

      {/* Client cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clients.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#555', padding: 40 }}>No se encontraron clientes</div>
        )}
        {clients.map(c => {
          const cfg = CAT_CONFIG[c.category];
          const Icon = cfg.icon;
          const isExp = expanded === c.id;
          const route = getRoute(c.routeId);
          const remits = getClientRemits(c.id);
          const creditPct = c.creditLimit > 0 ? Math.min((c.currentBalance / c.creditLimit) * 100, 100) : 0;
          const nearLimit = creditPct >= 80;

          return (
            <div key={c.id} style={{ background: '#1a1a1a', border: `1px solid ${nearLimit ? '#fb923c44' : '#2d2d2d'}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : c.id)}>
                {/* Category icon */}
                <div style={{ width: 42, height: 42, background: `${cfg.color}18`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${cfg.color}30` }}>
                  <Icon size={18} color={cfg.color} />
                </div>

                {/* Name & info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>{c.name}</span>
                    <span className="badge" style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>{cfg.label}</span>
                    {route && (
                      <span className="badge badge-gray" style={{ borderColor: route.color + '44', color: route.color }}>
                        {route.name}
                      </span>
                    )}
                    {nearLimit && <span className="badge badge-orange">Límite al {Math.round(creditPct)}%</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#555', display: 'flex', gap: 12 }}>
                    {c.contact && <span>{c.contact}</span>}
                    {c.zone && <span>· {c.zone}</span>}
                    {c.phone && <span>· {c.phone}</span>}
                  </div>
                </div>

                {/* Credit info */}
                <div style={{ width: 130, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginBottom: 3 }}>
                    <span>Crédito usado</span><span>{Math.round(creditPct)}%</span>
                  </div>
                  <div style={{ height: 5, background: '#2d2d2d', borderRadius: 3, marginBottom: 3 }}>
                    <div style={{ height: '100%', width: `${creditPct}%`, background: nearLimit ? '#fb923c' : '#FFE000', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#444' }}>límite: {fmt(c.creditLimit)}</div>
                </div>

                {/* Balance */}
                <div style={{ textAlign: 'right', minWidth: 90, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: c.currentBalance > 0 ? '#FFE000' : '#4ade80' }}>
                    {fmt(c.currentBalance)}
                  </div>
                  <div style={{ fontSize: 10, color: '#444' }}>saldo pendiente</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button className="btn-secondary" style={{ padding: '5px 8px' }} onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                  <button className="btn-danger" style={{ padding: '5px 8px' }} onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></button>
                </div>
                {isExp ? <ChevronUp size={16} color="#555" /> : <ChevronDown size={16} color="#555" />}
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={{ borderTop: '1px solid #222', background: '#111', padding: '16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
                    <Detail icon={<Phone size={12} />} label="Teléfono" value={c.phone} />
                    <Detail icon={<Mail size={12} />} label="Email" value={c.email} />
                    <Detail icon={<MapPin size={12} />} label="Dirección" value={c.address} />
                    <Detail icon={<CreditCard size={12} />} label="CUIT" value={c.cuit || '—'} />
                  </div>
                  {c.notes && (
                    <div style={{ marginBottom: 14, padding: '8px 12px', background: '#1a1a1a', borderRadius: 8, fontSize: 13, color: '#aaa' }}>
                      {c.notes}
                    </div>
                  )}
                  {/* Recent remits */}
                  <div style={{ fontSize: 11, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Últimas ventas ({remits.length})
                  </div>
                  {remits.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#333' }}>Sin ventas registradas aún</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[...remits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map(r => {
                        const sc = statusColor(r.status);
                        return (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: '#1a1a1a', borderRadius: 7 }}>
                            <div>
                              <span style={{ fontWeight: 500, color: '#ccc', fontSize: 13 }}>{r.number}</span>
                              <span style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>{r.date}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ color: sc, fontSize: 11, fontWeight: 600 }}>{r.status}</span>
                              <span style={{ fontWeight: 700, color: '#FFE000', fontSize: 13 }}>{fmt(r.total)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 20, fontSize: 18 }}>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Category */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Tipo de cliente</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(Object.entries(CAT_CONFIG) as [ClientCategory, typeof CAT_CONFIG[ClientCategory]][]).map(([cat, cfg]) => {
                    const Ic = cfg.icon;
                    return (
                      <button key={cat} onClick={() => setForm({ ...form, category: cat })}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${form.category === cat ? cfg.color : '#3d3d3d'}`, background: form.category === cat ? `${cfg.color}18` : '#222', color: form.category === cat ? cfg.color : '#aaa', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Ic size={14} /> {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Nombre / Razón social *</label>
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Taller García / Ferretería El Tornillo" />
              </div>
              <div>
                <label>Contacto (persona)</label>
                <input className="input-field" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Nombre del responsable" />
              </div>
              <div>
                <label>Teléfono</label>
                <input className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="011-1234-5678" />
              </div>
              <div>
                <label>Email</label>
                <input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@cliente.com" />
              </div>
              <div>
                <label>CUIT</label>
                <input className="input-field" value={form.cuit} onChange={e => setForm({ ...form, cuit: e.target.value })} placeholder="30-12345678-9" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Dirección</label>
                <input className="input-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle 123, Ciudad" />
              </div>
              <div>
                <label>Zona</label>
                <input className="input-field" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} placeholder="Norte / Centro / Sur" />
              </div>
              <div>
                <label>Ruta asignada</label>
                <select className="input-field" value={form.routeId} onChange={e => setForm({ ...form, routeId: e.target.value })}>
                  <option value="">Sin ruta</option>
                  {data.routes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.day})</option>)}
                </select>
              </div>
              <div>
                <label>Límite de crédito ($)</label>
                <input className="input-field" type="number" min={0} value={form.creditLimit} onChange={e => setForm({ ...form, creditLimit: Number(e.target.value) })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notas</label>
                <textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones del cliente..." style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.name}>{editing ? 'Guardar' : 'Agregar cliente'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Trash2 size={40} color="#f87171" style={{ margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ color: '#fff', marginBottom: 8 }}>¿Eliminar cliente?</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Se perderá el historial de ventas asociado.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#555', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: 13, color: '#aaa' }}>{value || '—'}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#1a1a1a', border: `1px solid ${color}22`, borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function statusColor(s: string) {
  return s === 'cobrado' ? '#4ade80' : s === 'entregado' ? '#60a5fa' : s === 'borrador' ? '#FFE000' : '#f87171';
}
