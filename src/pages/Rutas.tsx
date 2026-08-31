import { useState } from 'react';
import { Plus, Edit2, Trash2, MapPin, Wrench, Store, Clock, CheckCircle2 } from 'lucide-react';
import type { Route, RouteDay, AppData, Client } from '../types';
import { generateId } from '../store';

interface Props { data: AppData; onChange: (d: AppData) => void; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const DAY_LABELS: Record<RouteDay, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
};
const DAY_ORDER: RouteDay[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Today is Tuesday May 12 2026
const TODAY_DAY: RouteDay = 'martes';

const ROUTE_COLORS = ['#60a5fa', '#4ade80', '#fb923c', '#a78bfa', '#f472b6', '#34d399', '#FFE000', '#f87171'];

const emptyRoute = (): Omit<Route, 'id'> => ({
  name: '', day: 'lunes', clientIds: [], color: '#60a5fa', notes: '',
});

export default function Rutas({ data, onChange }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);
  const [form, setForm] = useState(emptyRoute());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<RouteDay | 'todas'>('todas');

  const visibleRoutes = data.routes.filter(r => selectedDay === 'todas' || r.day === selectedDay);

  function openAdd() {
    setEditing(null);
    setForm(emptyRoute());
    setShowModal(true);
  }

  function openEdit(r: Route) {
    setEditing(r);
    setForm({ name: r.name, day: r.day, clientIds: [...r.clientIds], color: r.color, notes: r.notes });
    setShowModal(true);
  }

  function handleSave() {
    if (editing) {
      onChange({ ...data, routes: data.routes.map(r => r.id === editing.id ? { ...r, ...form } : r) });
    } else {
      onChange({ ...data, routes: [...data.routes, { ...form, id: generateId() }] });
    }
    setShowModal(false);
  }

  function toggleClientInForm(clientId: string) {
    const ids = form.clientIds.includes(clientId)
      ? form.clientIds.filter(id => id !== clientId)
      : [...form.clientIds, clientId];
    setForm(f => ({ ...f, clientIds: ids }));
  }

  function getRouteStats(route: Route) {
    const clients = data.clients.filter(c => route.clientIds.includes(c.id));
    const pendingBalance = clients.reduce((s, c) => s + c.currentBalance, 0);
    const pendingRemits = data.remits.filter(r => route.clientIds.includes(r.clientId) && r.status === 'borrador');
    const totalToDeliver = pendingRemits.reduce((s, r) => s + r.total, 0);
    return { clients, pendingBalance, pendingRemits, totalToDeliver };
  }

  const CatIcon = (c: Client) => c.category === 'taller' ? <Wrench size={13} color="#fb923c" /> : <Store size={13} color="#60a5fa" />;

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Rutas de Distribución</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{data.routes.length} rutas configuradas</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Nueva Ruta</button>
      </div>

      {/* Day filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        <DayTab active={selectedDay === 'todas'} onClick={() => setSelectedDay('todas')} label="Todas" color="#666" isToday={false} />
        {DAY_ORDER.map(day => (
          <DayTab key={day} active={selectedDay === day} onClick={() => setSelectedDay(day)}
            label={DAY_LABELS[day]} color={data.routes.find(r => r.day === day)?.color || '#444'}
            isToday={day === TODAY_DAY}
            count={data.routes.filter(r => r.day === day).length}
          />
        ))}
      </div>

      {/* Today's highlight */}
      {(selectedDay === 'todas' || selectedDay === TODAY_DAY) && data.routes.some(r => r.day === TODAY_DAY) && (
        <div style={{ background: '#1a2200', border: '1px solid #FFE00033', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={16} color="#FFE000" />
          <span style={{ color: '#FFE000', fontWeight: 700, fontSize: 14 }}>Hoy ({DAY_LABELS[TODAY_DAY]}): </span>
          {data.routes.filter(r => r.day === TODAY_DAY).map(r => (
            <span key={r.id} style={{ color: r.color, fontWeight: 600, fontSize: 13, background: `${r.color}15`, padding: '3px 10px', borderRadius: 99, border: `1px solid ${r.color}33` }}>
              {r.name} · {r.clientIds.length} clientes
            </span>
          ))}
        </div>
      )}

      {visibleRoutes.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#555', padding: 40 }}>
          <MapPin size={32} color="#333" style={{ margin: '0 auto 8px', display: 'block' }} />
          No hay rutas para este día
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {visibleRoutes.map(route => {
          const { clients, pendingBalance, pendingRemits, totalToDeliver } = getRouteStats(route);
          const isToday = route.day === TODAY_DAY;
          return (
            <div key={route.id} style={{ background: '#1a1a1a', border: `1px solid ${isToday ? route.color + '55' : '#2d2d2d'}`, borderRadius: 14, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ background: `${route.color}12`, borderBottom: `1px solid ${route.color}22`, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, background: `${route.color}20`, border: `1px solid ${route.color}44`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={16} color={route.color} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{route.name}</div>
                    <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: route.color, fontWeight: 600 }}>{DAY_LABELS[route.day]}</span>
                      {isToday && <span style={{ background: '#FFE00022', color: '#FFE000', padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>HOY</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => openEdit(route)}><Edit2 size={13} /></button>
                  <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => setDeleteId(route.id)}><Trash2 size={13} /></button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid #222' }}>
                <StatCell label="Clientes" value={String(clients.length)} color={route.color} />
                <StatCell label="A cobrar" value={fmt(pendingBalance)} color="#FFE000" />
                <StatCell label="A entregar" value={`${pendingRemits.length} remitos`} color="#60a5fa" sub={totalToDeliver > 0 ? fmt(totalToDeliver) : undefined} />
              </div>

              {/* Client list */}
              <div style={{ padding: '12px 18px' }}>
                {clients.length === 0 && (
                  <div style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                    Sin clientes asignados
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {clients.map((c, idx) => {
                    const clientPendingRemits = data.remits.filter(r => r.clientId === c.id && r.status === 'borrador');
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#111', borderRadius: 8, border: '1px solid #1f1f1f' }}>
                        <div style={{ width: 20, height: 20, background: `${route.color}18`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: route.color }}>
                          {idx + 1}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {CatIcon(c)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                          <div style={{ fontSize: 10, color: '#444' }}>{c.contact}{c.phone ? ` · ${c.phone}` : ''}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {c.currentBalance > 0 && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFE000' }}>{fmt(c.currentBalance)}</div>
                          )}
                          {clientPendingRemits.length > 0 && (
                            <div style={{ fontSize: 10, color: '#60a5fa' }}>{clientPendingRemits.length} rem. pendiente{clientPendingRemits.length > 1 ? 's' : ''}</div>
                          )}
                          {c.currentBalance === 0 && clientPendingRemits.length === 0 && (
                            <CheckCircle2 size={13} color="#4ade80" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {route.notes && (
                  <div style={{ marginTop: 10, padding: '6px 10px', background: '#111', borderRadius: 7, fontSize: 12, color: '#555' }}>
                    {route.notes}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 20, fontSize: 18 }}>{editing ? 'Editar Ruta' : 'Nueva Ruta'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Nombre de la ruta *</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Ruta Norte" />
              </div>
              <div>
                <label>Día de la semana</label>
                <select className="input-field" value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value as RouteDay }))}>
                  {DAY_ORDER.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
              </div>
              <div>
                <label>Color de la ruta</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {ROUTE_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: `3px solid ${form.color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', padding: 0 }} />
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notas</label>
                <input className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Hora de salida, observaciones..." />
              </div>

              {/* Client assignment */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ marginBottom: 8, display: 'block' }}>Clientes en esta ruta ({form.clientIds.length} seleccionados)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                  {data.clients.map(c => {
                    const selected = form.clientIds.includes(c.id);
                    const cfg = c.category === 'taller' ? { color: '#fb923c', label: 'Taller' } : { color: '#60a5fa', label: 'Ferretería' };
                    return (
                      <div key={c.id} onClick={() => toggleClientInForm(c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: selected ? `${form.color}15` : '#111', border: `1px solid ${selected ? form.color + '44' : '#222'}`, transition: 'all 0.15s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected ? form.color : '#444'}`, background: selected ? form.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected && <CheckCircle2 size={10} color="#000" />}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, color: selected ? '#fff' : '#aaa', fontWeight: selected ? 600 : 400 }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: cfg.color }}>{cfg.label}</span>
                        <span style={{ fontSize: 11, color: '#444' }}>{c.zone}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.name}>{editing ? 'Guardar' : 'Crear ruta'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Trash2 size={40} color="#f87171" style={{ margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ color: '#fff', marginBottom: 8 }}>¿Eliminar ruta?</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Los clientes no serán eliminados.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => { onChange({ ...data, routes: data.routes.filter(r => r.id !== deleteId) }); setDeleteId(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayTab({ active, onClick, label, color, isToday, count }: { active: boolean; onClick: () => void; label: string; color: string; isToday: boolean; count?: number }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8, border: `1px solid ${active ? color : '#2d2d2d'}`,
      background: active ? `${color}18` : 'transparent', color: active ? color : '#666',
      cursor: 'pointer', fontWeight: active ? 700 : 500, fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
    }}>
      {label}
      {isToday && <span style={{ fontSize: 9, background: '#FFE00022', color: '#FFE000', padding: '1px 5px', borderRadius: 99, fontWeight: 800 }}>HOY</span>}
      {count !== undefined && count > 0 && <span style={{ background: `${color}22`, color, borderRadius: 99, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{count}</span>}
    </button>
  );
}

function StatCell({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ padding: '10px 14px', borderRight: '1px solid #222' }}>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#444' }}>{sub}</div>}
    </div>
  );
}
