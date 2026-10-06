import { fmtShortDate } from './dateFormat';
import type { WeeklyGoal } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

interface Props {
  goal: WeeklyGoal;
}

export default function GoalProgressBar({ goal }: Props) {
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.collected / goal.target) * 100)) : 100;
  const color = pct >= 100 ? '#4ade80' : pct >= 60 ? '#fbbf24' : '#f87171';

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>A cobrar esta semana</div>
        <div style={{ fontSize: 12, color: '#888' }}>{fmtShortDate(goal.weekStart)} al {fmtShortDate(goal.weekEnd)}</div>
      </div>
      <div style={{ height: 14, borderRadius: 999, background: '#1a1a1a', overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.4s ease', borderRadius: 999 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: '#fff', fontWeight: 700 }}>{fmt(goal.collected)}</span>
        <span style={{ color: '#666' }}>de {fmt(goal.target)} ({pct}%)</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
        Cuotas de la semana {fmt(goal.due)}
        {goal.carry > 0 && <> · <span style={{ color: '#f87171' }}>vencido de semanas anteriores {fmt(goal.carry)}</span></>}
      </div>
    </div>
  );
}
