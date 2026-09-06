import type { CourierGoal } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const METRIC_LABEL: Record<CourierGoal['metric'], string> = {
  cobros: 'cobrado',
  ventas: 'vendido',
  ambos: 'recaudado o vendido',
};

interface Props {
  goal: CourierGoal;
}

export default function GoalProgressBar({ goal }: Props) {
  const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.achieved / goal.targetAmount) * 100)) : 0;
  const color = pct >= 100 ? '#4ade80' : pct >= 60 ? '#FFE000' : '#f87171';

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>Objetivo {goal.periodType}</div>
        <div style={{ fontSize: 12, color: '#888' }}>{METRIC_LABEL[goal.metric]}</div>
      </div>
      <div style={{ height: 14, borderRadius: 999, background: '#1a1a1a', overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.4s ease', borderRadius: 999 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: '#fff', fontWeight: 700 }}>{fmt(goal.achieved)}</span>
        <span style={{ color: '#666' }}>de {fmt(goal.targetAmount)} ({pct}%)</span>
      </div>
    </div>
  );
}
