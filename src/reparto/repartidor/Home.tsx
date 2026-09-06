import { useEffect, useMemo, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { subscribeGoals } from '../api';
import GoalProgressBar from '../shared/GoalProgressBar';
import type { CourierGoal, RouteStop, Shift } from '../types';

interface Props {
  token: string;
  courierName: string;
  shift: Shift | null;
  stops: RouteStop[];
  onStart: () => void;
  onEnd: () => void;
}

function periodEndMs(type: CourierGoal['periodType'], startMs: number, periodStart: string): number {
  if (type === 'semanal') return startMs + 7 * 24 * 60 * 60 * 1000;
  const end = new Date(`${periodStart}T00:00:00`);
  end.setMonth(end.getMonth() + 1);
  return end.getTime();
}

function pickCurrentGoals(goals: CourierGoal[]): CourierGoal[] {
  const now = Date.now();
  const current = (type: CourierGoal['periodType']) =>
    goals
      .filter((g) => g.periodType === type)
      .filter((g) => {
        const start = new Date(`${g.periodStart}T00:00:00`).getTime();
        return now >= start && now < periodEndMs(type, start, g.periodStart);
      })
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
  return [current('semanal'), current('mensual')].filter((g): g is CourierGoal => !!g);
}

export default function Home({ token, courierName, shift, stops, onStart, onEnd }: Props) {
  const completed = stops.filter((s) => s.status === 'entregado').length;
  const pending = stops.length - completed;

  const [goals, setGoals] = useState<CourierGoal[]>([]);
  useEffect(() => subscribeGoals(token, setGoals), [token]);

  const currentGoals = useMemo(() => pickCurrentGoals(goals), [goals]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>Hola, {courierName}</h1>

      {currentGoals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, maxWidth: 620 }}>
          {currentGoals.map((g) => <GoalProgressBar key={g.id} goal={g} />)}
        </div>
      )}

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
