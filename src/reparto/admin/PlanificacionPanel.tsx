import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, PlayCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  addClientToList,
  applyList,
  createList,
  deleteList,
  fetchClients,
  fetchListClients,
  fetchStaffList,
  removeClientFromList,
  subscribeLists,
  updateList,
} from '../api';
import type { DeliveryList, DeliveryListClient, FieldClient, Staff } from '../types';

interface Props {
  token: string;
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function PlanificacionPanel({ token }: Props) {
  const [lists, setLists] = useState<DeliveryList[]>([]);
  const [couriers, setCouriers] = useState<Staff[]>([]);
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [listClients, setListClients] = useState<Record<string, DeliveryListClient[]>>({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDays, setNewDays] = useState<Set<number>>(new Set());
  const [addClientId, setAddClientId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => subscribeLists(token, setLists), [token]);
  useEffect(() => { fetchStaffList(token).then((list) => setCouriers(list.filter((s) => s.role === 'repartidor'))); }, [token]);
  useEffect(() => { fetchClients(token).then(setClients).catch(() => {}); }, [token]);

  async function loadListClients(id: string) {
    const cl = await fetchListClients(token, id);
    setListClients((prev) => ({ ...prev, [id]: cl }));
  }

  async function toggle(list: DeliveryList) {
    if (expanded === list.id) {
      setExpanded(null);
      return;
    }
    setExpanded(list.id);
    await loadListClients(list.id);
  }

  function toggleDay(day: number) {
    setNewDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function createNew() {
    if (!newName.trim()) return;
    await createList(token, newName.trim(), Array.from(newDays).sort());
    setShowNew(false);
    setNewName('');
    setNewDays(new Set());
  }

  async function assignCourier(list: DeliveryList, courierId: string) {
    const courier = couriers.find((c) => c.id === courierId);
    await updateList(token, list.id, { courierId: courier?.id ?? null, courierName: courier?.name ?? null });
  }

  async function addClient(listId: string) {
    if (!addClientId) return;
    await addClientToList(token, listId, addClientId);
    setAddClientId('');
    await loadListClients(listId);
  }

  async function removeClient(listId: string, clientId: string) {
    await removeClientFromList(token, listId, clientId);
    await loadListClients(listId);
  }

  async function apply(list: DeliveryList) {
    try {
      const result = await applyList(token, list.id);
      setMessage(`${result.added} cliente(s) agregados a la ruta de hoy de ${list.courierName}.`);
      setTimeout(() => setMessage(''), 4000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo aplicar.');
    }
  }

  async function remove(list: DeliveryList) {
    if (!confirm(`¿Eliminar la lista "${list.name}"?`)) return;
    await deleteList(token, list.id);
  }

  const availableForList = useMemo(() => {
    return (listId: string) => {
      const assigned = new Set((listClients[listId] ?? []).map((c) => c.id));
      return clients.filter((c) => !assigned.has(c.id));
    };
  }, [clients, listClients]);

  return (
    <div>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 14 }}>
        Listas de clientes que se repiten en ciertos días de la semana para un repartidor fijo. "Aplicar a hoy" agrega esos clientes a la ruta de hoy sin duplicar los que ya estén.
      </p>

      {message && <div style={{ color: '#4ade80', fontSize: 13, marginBottom: 12 }}>{message}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Nueva lista</button>
      </div>

      {showNew && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label>Nombre</label>
          <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Zona Norte" />
          <label style={{ marginTop: 10 }}>Días de visita</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <button key={i} className={newDays.has(i) ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => toggleDay(i)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
            <button className="btn-primary" onClick={createNew}>Crear</button>
          </div>
        </div>
      )}

      {lists.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay listas creadas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lists.map((list) => (
            <div key={list.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggle(list)}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{list.name}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>
                    {list.weekdays.map((d) => WEEKDAY_LABELS[d]).join('/') || 'Sin días'} · {list.clientCount} cliente{list.clientCount !== 1 ? 's' : ''}
                    {list.courierName ? ` · ${list.courierName}` : ' · sin repartidor asignado'}
                  </div>
                </div>
                {expanded === list.id ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
              </div>

              {expanded === list.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2d2d2d' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <label>Repartidor asignado</label>
                      <select className="input-field" style={{ width: 180 }} value={list.courierId ?? ''} onChange={(e) => assignCourier(list, e.target.value)}>
                        <option value="">Sin asignar</option>
                        {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <button className="btn-primary" onClick={() => apply(list)} disabled={!list.courierId}><PlayCircle size={14} /> Aplicar a hoy</button>
                    <button className="btn-danger" onClick={() => remove(list)}><Trash2 size={14} /> Eliminar lista</button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <select className="input-field" value={addClientId} onChange={(e) => setAddClientId(e.target.value)}>
                      <option value="">Agregar cliente...</option>
                      {availableForList(list.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button className="btn-secondary" onClick={() => addClient(list.id)}><Plus size={14} /></button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(listClients[list.id] ?? []).map((c) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '6px 10px', borderRadius: 8 }}>
                        <div>
                          <span style={{ color: '#fff', fontSize: 13 }}>{c.name}</span>
                          <span style={{ color: '#666', fontSize: 12 }}> — {c.address}</span>
                        </div>
                        <button style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }} onClick={() => removeClient(list.id, c.id)}><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
