import { useEffect, useMemo, useState } from 'react';
import { Wallet, Banknote, Landmark, FileText, HelpCircle, Printer, Download, Plus, Pencil, Trash2, X } from 'lucide-react';
import { deletePayment, fetchPayments, subscribePayments, updatePayment } from '../api';
import CobrosForm from '../repartidor/CobrosForm';
import { downloadPaymentReceiptPdf, printPaymentReceipt } from '../printReceipt';
import type { Payment, PaymentMethod, Session } from '../types';

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // semana arranca lunes
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

interface Props {
  session: Session;
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

export default function CobrosPanel({ session }: Props) {
  const token = session.token;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState<PaymentMethod>('efectivo');
  const [editCheck, setEditCheck] = useState('');
  const [editBank, setEditBank] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
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

  function refresh() {
    fetchPayments(token).then(setPayments).catch(() => {});
  }

  function startEdit(p: Payment) {
    setEditing(p);
    setEditAmount(String(p.amount));
    setEditMethod(p.method);
    setEditCheck(p.checkNumber ?? '');
    setEditBank(p.bank ?? '');
    setEditNotes(p.notes ?? '');
    setEditError('');
  }

  async function saveEdit() {
    if (!editing || saving) return;
    const amount = Number(editAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditError('Ingresá un monto válido.');
      return;
    }
    if (editMethod === 'cheque' && (!editCheck.trim() || !editBank.trim())) {
      setEditError('Completá número de cheque y banco.');
      return;
    }
    setSaving(true);
    try {
      await updatePayment(token, editing.id, {
        amount,
        method: editMethod,
        checkNumber: editMethod === 'cheque' ? editCheck.trim() : null,
        bank: editMethod === 'cheque' ? editBank.trim() : null,
        notes: editNotes.trim() || null,
      });
      setEditing(null);
      refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'No se pudo guardar el cobro.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Payment) {
    if (!confirm(`¿Eliminar el cobro de ${fmt(p.amount)} de ${p.clientName}${p.installmentId ? ' (la cuota vuelve a quedar pendiente)' : ''}?`)) return;
    setActionError('');
    try {
      await deletePayment(token, p.id);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo eliminar el cobro.');
    }
  }

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Wallet size={22} color="#FE4806" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(total)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{filtered.length} cobro{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <button className={showForm ? 'btn-secondary' : 'btn-primary'} onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X size={14} /> Cerrar</> : <><Plus size={14} /> Registrar cobro</>}
        </button>
      </div>

      {showForm && (
        <div style={{ maxWidth: 560, marginBottom: 20 }}>
          <CobrosForm session={session} />
        </div>
      )}

      {actionError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{actionError}</div>}

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
                <div style={{ color: '#FE4806', fontWeight: 700, fontSize: 15 }}>{fmt(p.amount)}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Imprimir recibo" onClick={() => printPaymentReceipt(p)}>
                    <Printer size={13} />
                  </button>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Descargar PDF" onClick={() => downloadPaymentReceiptPdf(p)}>
                    <Download size={13} />
                  </button>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} title="Corregir cobro" onClick={() => startEdit(p)}>
                    <Pencil size={13} />
                  </button>
                  <button className="btn-danger" style={{ padding: '4px 8px' }} title="Eliminar cobro" onClick={() => void remove(p)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setEditing(null)}>
          <div className="card" style={{ maxWidth: 440, width: '100%', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Corregir cobro</div>
                <div style={{ color: '#888', fontSize: 12 }}>{editing.clientName} · cargado por {editing.courierName}</div>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setEditing(null)}><X size={14} /></button>
            </div>

            <label>Monto</label>
            <input className="input-field" inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />

            <label style={{ marginTop: 14 }}>Método de pago</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <button key={k} className={editMethod === k ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setEditMethod(k as PaymentMethod)}>
                  {v}
                </button>
              ))}
            </div>

            {editMethod === 'cheque' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <div>
                  <label>Número de cheque</label>
                  <input className="input-field" value={editCheck} onChange={(e) => setEditCheck(e.target.value)} />
                </div>
                <div>
                  <label>Banco</label>
                  <input className="input-field" value={editBank} onChange={(e) => setEditBank(e.target.value)} />
                </div>
              </div>
            )}

            <label style={{ marginTop: 14 }}>Observaciones</label>
            <textarea className="input-field" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} style={{ resize: 'vertical' }} />

            {editError && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{editError}</div>}

            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 16 }} onClick={() => void saveEdit()} disabled={saving}>
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
