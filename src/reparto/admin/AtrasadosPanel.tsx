import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { subscribeOverdue } from '../api';
import type { OverdueReport } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDueDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const weeksLabel = (n: number) => (n === 1 ? 'de la semana anterior' : `hace ${n} semanas`);

export default function AtrasadosPanel({ token }: Props) {
  const [report, setReport] = useState<OverdueReport | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => subscribeOverdue(token, setReport), [token]);

  if (!report) return <p style={{ color: '#666', fontSize: 14 }}>Cargando...</p>;

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <AlertTriangle size={22} color="#f87171" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(report.totalRemaining)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {report.totalInstallments} cuota{report.totalInstallments !== 1 ? 's' : ''} atrasada{report.totalInstallments !== 1 ? 's' : ''} · {report.clients.length} cliente{report.clients.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {report.clients.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay cuotas atrasadas. Todo lo vencido en semanas anteriores está cobrado.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.clients.map((c) => {
            const key = c.clientId ?? c.clientName;
            const open = expanded === key;
            return (
              <div key={key} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(open ? null : key)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{c.clientName}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>
                      {c.overdueCount} cuota{c.overdueCount !== 1 ? 's' : ''} atrasada{c.overdueCount !== 1 ? 's' : ''} · la más vieja {weeksLabel(c.maxWeeksLate)} · {c.courierNames.join(', ')}
                    </div>
                  </div>
                  <div style={{ color: '#f87171', fontWeight: 700, fontSize: 15 }}>{fmt(c.totalRemaining)}</div>
                  {open ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
                </div>
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
                    {c.installments.map((i) => (
                      <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ color: '#ccc', minWidth: 60 }}>{i.number}/{i.total}</span>
                        <span style={{ color: '#666', flex: 1 }}>venció {fmtDueDate(i.dueDate)} · {weeksLabel(i.weeksLate)}</span>
                        {i.paid > 0 && <span style={{ color: '#666', fontSize: 12 }}>pagó {fmt(i.paid)} de {fmt(i.amount)}</span>}
                        <strong style={{ color: '#f87171' }}>debe {fmt(i.remaining)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
