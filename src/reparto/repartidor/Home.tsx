import { Play, Square } from 'lucide-react';
import type { RouteStop, Shift } from '../types';

interface Props {
  courierName: string;
  shift: Shift | null;
  stops: RouteStop[];
  onStart: () => void;
  onEnd: () => void;
}

export default function Home({ courierName, shift, stops, onStart, onEnd }: Props) {
  const completed = stops.filter((s) => s.status === 'entregado').length;
  const pending = stops.length - completed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>Hola, {courierName}</h1>

      {shift ? (
        <div className="card" style={{ borderColor: '#4ade8033', maxWidth: 420 }}>
          <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Turno activo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
            <div className="stat-card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{completed}/{stops.length}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Entregados</div>
            </div>
            <div className="stat-card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{pending}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Pendientes</div>
            </div>
          </div>
          <button className="btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={onEnd}>
            <Square size={14} /> Terminar turno
          </button>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 420 }}>
          <div style={{ color: '#888', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Turno no iniciado</div>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 14 }}>{stops.length} parada{stops.length !== 1 ? 's' : ''} asignada{stops.length !== 1 ? 's' : ''} para hoy.</p>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onStart}>
            <Play size={14} /> Iniciar turno
          </button>
        </div>
      )}
    </div>
  );
}
