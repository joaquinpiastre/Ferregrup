import { useState } from 'react';
import { Navigation, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { updateRouteStopStatus } from '../api';
import type { RouteStop, Session } from '../types';

interface Props {
  session: Session;
  stops: RouteStop[];
  onChanged: () => void;
}

const STATUS_LABEL: Record<RouteStop['status'], string> = {
  pendiente: 'Pendiente',
  en_camino: 'En camino',
  entregado: 'Entregado',
  problema: 'Problema',
};

const STATUS_BADGE: Record<RouteStop['status'], string> = {
  pendiente: 'badge badge-gray',
  en_camino: 'badge badge-blue',
  entregado: 'badge badge-green',
  problema: 'badge badge-red',
};

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function RutaDelDia({ session, stops, onChanged }: Props) {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const ordered = [...stops].sort((a, b) => a.orderNum - b.orderNum);

  async function markVisiting(stop: RouteStop) {
    await updateRouteStopStatus(session.token, stop.id, 'en_camino');
    onChanged();
  }

  async function markDone(stop: RouteStop, status: 'entregado' | 'problema') {
    const note = noteDrafts[stop.id]?.trim();
    await updateRouteStopStatus(session.token, stop.id, status, note || undefined);
    onChanged();
  }

  if (ordered.length === 0) {
    return <p style={{ color: '#666', fontSize: 14, padding: 20 }}>No tenés paradas asignadas para hoy.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ordered.map((s, i) => {
        const isFinal = s.status === 'entregado' || s.status === 'problema';
        return (
          <div key={s.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{i + 1}. {s.clientName}</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{s.clientAddress}</div>
              </div>
              <span className={STATUS_BADGE[s.status]}>{STATUS_LABEL[s.status]}</span>
            </div>
            {s.adminNotes && <div style={{ color: '#FFE000', fontSize: 12, marginTop: 8 }}>Nota del local: {s.adminNotes}</div>}
            {s.courierNotes && <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Tu nota: {s.courierNotes}</div>}

            {!isFinal && (
              <>
                <a href={mapsUrl(s.clientAddress)} target="_blank" rel="noreferrer" className="btn-secondary" style={{ marginTop: 10, width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
                  <Navigation size={14} /> Navegar
                </a>
                {s.status === 'pendiente' ? (
                  <button className="btn-primary" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => markVisiting(s)}>
                    <Play size={14} /> Visitar
                  </button>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      className="input-field"
                      rows={2}
                      placeholder="Nota de la visita (opcional)"
                      value={noteDrafts[s.id] ?? ''}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      style={{ resize: 'vertical', marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => markDone(s, 'entregado')}>
                        <CheckCircle2 size={14} /> Visitado
                      </button>
                      <button className="btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={() => markDone(s, 'problema')}>
                        <AlertTriangle size={14} /> Problema
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
