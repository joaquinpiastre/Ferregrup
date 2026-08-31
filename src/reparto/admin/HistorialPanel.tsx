import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchShiftStops, fetchShifts } from '../api';
import type { Shift, ShiftStop } from '../types';

interface Props {
  token: string;
}

const STATUS_LABEL: Record<ShiftStop['status'], string> = {
  pendiente: 'Pendiente',
  en_camino: 'En camino',
  entregado: 'Entregado',
  problema: 'Problema',
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function HistorialPanel({ token }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stopsByShift, setStopsByShift] = useState<Record<string, ShiftStop[]>>({});

  useEffect(() => {
    fetchShifts(token).then(setShifts).catch(() => {});
  }, [token]);

  const closed = shifts.filter((s) => s.endedAt);

  async function toggle(shift: Shift) {
    if (expanded === shift.id) {
      setExpanded(null);
      return;
    }
    setExpanded(shift.id);
    if (!stopsByShift[shift.id]) {
      const stops = await fetchShiftStops(token, shift.id);
      setStopsByShift((prev) => ({ ...prev, [shift.id]: stops }));
    }
  }

  if (closed.length === 0) {
    return <p style={{ color: '#666', fontSize: 14 }}>Todavía no hay turnos cerrados.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {closed.map((s) => (
        <div key={s.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggle(s)}>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{s.courierName}</div>
              <div style={{ color: '#888', fontSize: 12 }}>
                {fmtDate(s.startedAt)} · {s.completedCount}/{s.totalCount} entregados · {s.minutesOnRoute ?? 0} min en ruta
              </div>
            </div>
            {expanded === s.id ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
          </div>

          {expanded === s.id && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2d2d2d', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(stopsByShift[s.id] ?? []).length === 0 ? (
                <p style={{ color: '#666', fontSize: 13 }}>Sin paradas registradas ese día.</p>
              ) : (
                stopsByShift[s.id].map((stop, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{stop.clientName}</span>
                    <span style={{ color: '#666' }}> — {stop.clientAddress} · </span>
                    <span className={stop.status === 'entregado' ? 'badge badge-green' : stop.status === 'problema' ? 'badge badge-red' : 'badge badge-gray'}>
                      {STATUS_LABEL[stop.status]}
                    </span>
                    {stop.courierNotes && <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>Nota: {stop.courierNotes}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
