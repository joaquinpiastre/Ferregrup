import { useEffect, useMemo, useState } from 'react';
import { Plus, Radio } from 'lucide-react';
import { createTracker, deleteTracker, fetchStaffList, subscribeTrackers } from '../api';
import type { Staff, Tracker } from '../types';

interface Props {
  token: string;
}

function statusOf(lastContact?: number): { label: string; cls: string } {
  if (!lastContact) return { label: 'Sin señal', cls: 'badge badge-gray' };
  const mins = (Date.now() - lastContact) / 60000;
  if (mins < 2) return { label: 'En línea', cls: 'badge badge-green' };
  if (mins < 10) return { label: 'Reciente', cls: 'badge badge-yellow' };
  return { label: 'Sin señal', cls: 'badge badge-gray' };
}

function fmtLast(lastContact?: number): string {
  if (!lastContact) return 'Nunca';
  return new Date(lastContact).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TrackersPanel({ token }: Props) {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [couriers, setCouriers] = useState<Staff[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [imei, setImei] = useState('');
  const [name, setName] = useState('');
  const [courierId, setCourierId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeTrackers(token, setTrackers), [token]);
  useEffect(() => {
    fetchStaffList().then((list) => {
      const reps = list.filter((s) => s.role === 'repartidor');
      setCouriers(reps);
      setCourierId((prev) => prev || reps[0]?.id || '');
    });
  }, []);

  const courierName = useMemo(() => (id: string) => couriers.find((c) => c.id === id)?.name ?? id, [couriers]);

  async function save() {
    if (!/^\d{15}$/.test(imei)) {
      setError('El IMEI debe tener 15 dígitos.');
      return;
    }
    if (!name.trim() || !courierId) {
      setError('Completá el nombre y elegí un repartidor.');
      return;
    }
    try {
      await createTracker(token, { imei, name: name.trim(), courierId });
      setShowForm(false);
      setImei('');
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  async function remove(t: Tracker) {
    if (!confirm(`¿Desactivar el tracker ${t.name}?`)) return;
    await deleteTracker(token, t.imei);
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 14 }}>
        Trackers GPS físicos (hardware GT06). El repartidor no necesita hacer nada — el dispositivo se conecta solo al servidor y reporta su posición.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => { setShowForm(true); setError(''); }}><Plus size={14} /> Registrar tracker</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label>IMEI (15 dígitos)</label>
              <input className="input-field" inputMode="numeric" maxLength={15} value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))} />
            </div>
            <div>
              <label>Nombre / apodo</label>
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Moto 1" />
            </div>
            <div>
              <label>Repartidor</label>
              <select className="input-field" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>Guardar</button>
          </div>
        </div>
      )}

      {trackers.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay trackers registrados.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trackers.map((t) => {
            const status = statusOf(t.lastContact);
            return (
              <div key={t.imei} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, opacity: t.active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Radio size={16} color="#888" />
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>IMEI {t.imei} · {courierName(t.courierId)} · Último contacto: {fmtLast(t.lastContact)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={status.cls}>{status.label}</span>
                  {t.active && <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => remove(t)}>Desactivar</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
