import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, MapPin } from 'lucide-react';
import { assignRouteStops, deleteRouteStop, fetchClients, fetchRouteStops, fetchStaffList, reorderRouteStop, subscribeRouteStops } from '../api';
import type { FieldClient, RouteStop, RouteStopStatus, Staff } from '../types';

interface Props {
  token: string;
}

const STATUS_LABEL: Record<RouteStopStatus, string> = {
  pendiente: 'Pendiente',
  en_camino: 'En camino',
  entregado: 'Entregado',
  problema: 'Problema',
};

const STATUS_BADGE: Record<RouteStopStatus, string> = {
  pendiente: 'badge badge-gray',
  en_camino: 'badge badge-blue',
  entregado: 'badge badge-green',
  problema: 'badge badge-red',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RutasPanel({ token }: Props) {
  const [couriers, setCouriers] = useState<Staff[]>([]);
  const [courierId, setCourierId] = useState('');
  const [date, setDate] = useState(today());
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStaffList().then((list) => {
      const reps = list.filter((s) => s.role === 'repartidor');
      setCouriers(reps);
      setCourierId((prev) => prev || reps[0]?.id || '');
    });
    fetchClients(token).then(setClients).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!courierId) return;
    return subscribeRouteStops(token, date, courierId, setStops);
  }, [token, date, courierId]);

  const availableClients = useMemo(() => {
    const assignedIds = new Set(stops.map((s) => s.clientId));
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => !assignedIds.has(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  }, [clients, stops, search]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function refresh() {
    if (!courierId) return;
    fetchRouteStops(token, date, courierId).then(setStops).catch(() => {});
  }

  async function confirmAssign() {
    const courier = couriers.find((c) => c.id === courierId);
    if (!courier || selected.size === 0) return;
    const chosen = clients.filter((c) => selected.has(c.id)).map((c) => ({ id: c.id, name: c.name, address: c.address }));
    await assignRouteStops(token, { courierId: courier.id, courierName: courier.name, scheduledDate: date, clients: chosen });
    setSelected(new Set());
    setShowAssign(false);
    refresh();
  }

  async function move(stop: RouteStop, dir: 'up' | 'down') {
    await reorderRouteStop(token, stop.id, dir);
    refresh();
  }

  async function remove(stop: RouteStop) {
    if (!confirm(`¿Quitar a ${stop.clientName} de la ruta?`)) return;
    await deleteRouteStop(token, stop.id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label>Repartidor</label>
          <select className="input-field" style={{ width: 200 }} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
            {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>Fecha</label>
          <input className="input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => setShowAssign(true)} disabled={!courierId}><Plus size={14} /> Asignar clientes</button>
      </div>

      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 14, fontSize: 17 }}>Asignar clientes a {couriers.find((c) => c.id === courierId)?.name} — {date}</h2>
            <input className="input-field" placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {availableClients.length === 0 ? (
                <p style={{ color: '#666', fontSize: 13 }}>No hay más clientes para agregar.</p>
              ) : availableClients.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: selected.has(c.id) ? '#2d2500' : '#111', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  <div>
                    <div style={{ color: '#fff', fontSize: 13 }}>{c.name}</div>
                    <div style={{ color: '#666', fontSize: 12 }}>{c.address}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <span style={{ color: '#888', fontSize: 13 }}>{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => setShowAssign(false)}>Cancelar</button>
                <button className="btn-primary" onClick={confirmAssign} disabled={selected.size === 0}>Asignar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stops.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>Sin clientes asignados para ese día.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stops.map((s, i) => (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="btn-secondary" style={{ padding: 2 }} onClick={() => move(s, 'up')} disabled={i === 0}><ArrowUp size={12} /></button>
                <button className="btn-secondary" style={{ padding: 2 }} onClick={() => move(s, 'down')} disabled={i === stops.length - 1}><ArrowDown size={12} /></button>
              </div>
              <MapPin size={16} color="#666" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{i + 1}. {s.clientName}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{s.clientAddress}</div>
                {s.courierNotes && <div style={{ color: '#FFE000', fontSize: 12, marginTop: 2 }}>Nota del repartidor: {s.courierNotes}</div>}
              </div>
              <span className={STATUS_BADGE[s.status]}>{STATUS_LABEL[s.status]}</span>
              <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => remove(s)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
