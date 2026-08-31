import { useEffect, useMemo, useState } from 'react';
import { Wallet, Banknote, Landmark, FileText, HelpCircle } from 'lucide-react';
import { subscribePayments } from '../api';
import type { Payment, PaymentMethod } from '../types';

interface Props {
  token: string;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  efectivo: Banknote,
  transferencia: Landmark,
  cheque: FileText,
  otro: HelpCircle,
};

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CobrosPanel({ token }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [courierFilter, setCourierFilter] = useState('todos');
  const [methodFilter, setMethodFilter] = useState<'todos' | PaymentMethod>('todos');

  useEffect(() => subscribePayments(token, setPayments), [token]);

  const couriers = useMemo(() => Array.from(new Set(payments.map((p) => p.courierName))), [payments]);

  const filtered = useMemo(
    () =>
      payments
        .filter((p) => courierFilter === 'todos' || p.courierName === courierFilter)
        .filter((p) => methodFilter === 'todos' || p.method === methodFilter),
    [payments, courierFilter, methodFilter]
  );

  const total = filtered.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Wallet size={22} color="#FFE000" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(total)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{filtered.length} cobro{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select className="input-field" style={{ width: 200 }} value={courierFilter} onChange={(e) => setCourierFilter(e.target.value)}>
          <option value="todos">Todos los repartidores</option>
          {couriers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input-field" style={{ width: 180 }} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}>
          <option value="todos">Todos los métodos</option>
          {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay cobros registrados.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((p) => {
            const Icon = METHOD_ICON[p.method];
            return (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
                <Icon size={18} color="#888" />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.clientName}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>
                    {p.courierName} · {METHOD_LABEL[p.method]}{p.method === 'cheque' && p.checkNumber ? ` #${p.checkNumber} (${p.bank})` : ''} · {fmtDate(p.createdAt)}
                  </div>
                  {p.notes && <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>{p.notes}</div>}
                </div>
                <div style={{ color: '#FFE000', fontWeight: 700, fontSize: 15 }}>{fmt(p.amount)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
