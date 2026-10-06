import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { subscribeGoals } from '../api';
import GoalProgressBar from '../shared/GoalProgressBar';
import { fmtShortDate } from '../shared/dateFormat';
import type { CourierWeeklyGoals, WeeklyGoal } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const STATE_LABEL: Record<WeeklyGoal['state'], string> = { pasada: 'Cerrada', actual: 'En curso', futura: 'Próxima' };

export default function ObjetivosPanel({ token }: Props) {
  const [couriers, setCouriers] = useState<CourierWeeklyGoals[]>([]);

  useEffect(() => subscribeGoals(token, setCouriers), [token]);

  if (couriers.length === 0) {
    return <p style={{ color: '#666', fontSize: 14 }}>Todavía no hay cuotas por cobrar. El objetivo de cada repartidor se arma solo a partir de las ventas en cuotas.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
        El objetivo semanal de cada repartidor son las cuotas que vencen esa semana más lo que quedó sin cobrar de semanas anteriores.
      </p>
      {couriers.map((c) => {
        const current = c.weeks.find((w) => w.state === 'actual');
        const history = [...c.weeks].reverse();
        return (
          <div key={c.courierId}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Target size={15} color="#FE4806" />
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{c.courierName}</div>
            </div>
            {current && <div style={{ maxWidth: 360, marginBottom: 12 }}><GoalProgressBar goal={current} /></div>}
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#888', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Semana</th>
                    <th style={{ padding: '10px 12px' }}>Cuotas</th>
                    <th style={{ padding: '10px 12px' }}>Arrastre</th>
                    <th style={{ padding: '10px 12px' }}>Objetivo</th>
                    <th style={{ padding: '10px 12px' }}>Cobrado</th>
                    <th style={{ padding: '10px 12px' }}>{'Faltó'}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((w) => (
                    <tr key={w.weekStart} style={{ borderTop: '1px solid #222', textAlign: 'right', color: '#ccc' }}>
                      <td style={{ textAlign: 'left', padding: '8px 12px' }}>
                        {fmtShortDate(w.weekStart)} al {fmtShortDate(w.weekEnd)}{' '}
                        <span style={{ color: w.state === 'actual' ? '#FE4806' : '#666', fontSize: 11 }}>{STATE_LABEL[w.state]}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>{fmt(w.due)}</td>
                      <td style={{ padding: '8px 12px', color: w.carry > 0 ? '#f87171' : undefined }}>{fmt(w.carry)}</td>
                      <td style={{ padding: '8px 12px', color: '#fff', fontWeight: 600 }}>{fmt(w.target)}</td>
                      <td style={{ padding: '8px 12px' }}>{w.state === 'futura' ? '—' : fmt(w.collected)}</td>
                      <td style={{ padding: '8px 12px', color: w.state === 'futura' ? '#666' : w.pending > 0 ? '#f87171' : '#4ade80', fontWeight: 600 }}>
                        {w.state === 'futura' ? '—' : fmt(w.pending)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
