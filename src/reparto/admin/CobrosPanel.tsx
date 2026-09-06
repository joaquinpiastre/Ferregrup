import { useEffect, useMemo, useState } from 'react';
import { Wallet, Banknote, Landmark, FileText, HelpCircle, Printer, Download } from 'lucide-react';
import { subscribePayments } from '../api';
import { downloadPaymentReceiptPdf, printPaymentReceipt } from '../printReceipt';
import type { Payment, PaymentMethod } from '../types';

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // semana arranca lunes
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

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

type RangeFilter = 'todos' | 'esta_semana' | 'semana_pasada';

export default function CobrosPanel({ token }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [courierFilter, setCourierFilter] = useState('todos');
  const [methodFilter, setMethodFilter] = useState<'todos' | PaymentMethod>('todos');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('todos');

  useEffect(() => subscribePayments(token, setPayments), [token]);

  const couriers = useMemo(() => Array.from(new Set(payments.map((p) => p.courierName))), [payments]);

  const filtered = useMemo(() => {
    const thisWeekStart = startOfWeek(new Date()).getTime();
    const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
    return payments
      .filter((p) => courierFilter === 'todos' || p.courierName === courierFilter)
      .filter((p) => methodFilter === 'todos' || p.method === methodFilter)
      .filter((p) => {
        if (rangeFilter === 'todos') return true;
        if (rangeFilter === 'esta_semana') return p.createdAt >= thisWeekStart;
        return p.createdAt >= lastWeekStart && p.createdAt < thisWeekStart;
      });
  }, [payments, courierFilter, methodFilter, rangeFilter]);

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
        <select className="input-field" style={{ width: 170 }} value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value as RangeFilter)}>
          <option value="todos">Todas las fechas</option>
          <option value="esta_semana">Esta semana</option>
          <option value="semana_pasada">Semana pasada</option>
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
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Imprimir recibo" onClick={() => printPaymentReceipt(p)}>
                    <Printer size={13} />
                  </button>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Descargar PDF" onClick={() => downloadPaymentReceiptPdf(p)}>
                    <Download size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
