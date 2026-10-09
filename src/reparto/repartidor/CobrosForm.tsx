import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Printer, Download } from 'lucide-react';
import { createPayment, fetchClientBalance, fetchClientStatement, subscribeClients } from '../api';
import { downloadPaymentsReceiptPdf, printPaymentsReceipt, type ReceiptLine } from '../printReceipt';
import type { FieldClient, PaymentMethod, Session } from '../types';

interface Props {
  session: Session;
}

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'otro', label: 'Otro' },
];

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDueDate(d?: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

interface PendingInstallment {
  id: string;
  saleId: string;
  number: number;
  total: number;
  amount: number;
  paid: number;
  dueDate?: string;
  saleDescription?: string;
}

export default function CobrosForm({ session }: Props) {
  const [clients, setClients] = useState<FieldClient[]>([]);
  useEffect(() => subscribeClients(session.token, setClients), [session.token]);

  const [query, setQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<FieldClient | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [checkNumber, setCheckNumber] = useState('');
  const [bank, setBank] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ReceiptLine[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [pendingInstallments, setPendingInstallments] = useState<PendingInstallment[]>([]);
  // cuotas tildadas -> monto a cobrar de cada una (texto, editable)
  const [selected, setSelected] = useState<Record<string, string>>({});

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 6);
  }, [clients, query]);

  useEffect(() => {
    if (!selectedClient) return;
    let cancelled = false;
    fetchClientBalance(session.token, selectedClient.id)
      .then((b) => { if (!cancelled) setBalance(b.balance); })
      .catch(() => { if (!cancelled) setBalance(null); });
    fetchClientStatement(session.token, selectedClient.id)
      .then((st) => {
        if (cancelled) return;
        const pending = st.sales.flatMap((s) =>
          (s.installments ?? [])
            .filter((inst) => inst.paid < inst.amount)
            .map((inst) => ({
              id: inst.id,
              saleId: s.id,
              number: inst.number,
              total: s.installmentsTotal ?? (s.installments?.length ?? 1),
              amount: inst.amount,
              paid: inst.paid,
              dueDate: inst.dueDate,
              saleDescription: s.description,
            }))
        );
        pending.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
        setPendingInstallments(pending);
      })
      .catch(() => setPendingInstallments([]));
    return () => { cancelled = true; };
  }, [selectedClient, session.token]);

  function chooseClient(c: FieldClient) {
    setBalance(null);
    setPendingInstallments([]);
    setSelected({});
    setSelectedClient(c);
    setQuery('');
  }

  function clearClient() {
    setSelectedClient(null);
    setBalance(null);
    setPendingInstallments([]);
    setSelected({});
  }

  const remainingOf = (inst: PendingInstallment) => Math.round((inst.amount - inst.paid) * 100) / 100;
  const selectedList = pendingInstallments.filter((i) => i.id in selected);
  const selectedTotal = selectedList.reduce((sum, i) => sum + (Number((selected[i.id] ?? '').replace(',', '.')) || 0), 0);
  const allSelected = pendingInstallments.length > 0 && selectedList.length === pendingInstallments.length;

  function toggleInstallment(inst: PendingInstallment) {
    setSelected((prev) => {
      const next = { ...prev };
      if (inst.id in next) delete next[inst.id];
      else next[inst.id] = String(remainingOf(inst));
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? {} : Object.fromEntries(pendingInstallments.map((i) => [i.id, String(remainingOf(i))])));
  }

  async function submit() {
    setError('');
    if (!selectedClient) {
      setError('Elegí un cliente.');
      return;
    }
    // Cada cuota tildada genera un cobro; si no hay cuotas tildadas es un pago general por el monto escrito.
    const items: { installmentId?: string; amount: number; line: Omit<ReceiptLine, 'payment'> }[] = [];
    if (selectedList.length > 0) {
      for (const inst of selectedList) {
        const value = Number((selected[inst.id] ?? '').replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0) {
          setError(`Ingresá un monto válido para la cuota ${inst.number}/${inst.total}${inst.saleDescription ? ` (${inst.saleDescription})` : ''}.`);
          return;
        }
        items.push({
          installmentId: inst.id,
          amount: value,
          line: { detail: inst.saleDescription ? `Cuota ${inst.number}/${inst.total} — ${inst.saleDescription}` : `Cuota ${inst.number}/${inst.total}`, cuota: `${inst.number}/${inst.total}` },
        });
      }
    } else {
      const value = Number(amount.replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0) {
        setError('Ingresá un monto válido.');
        return;
      }
      items.push({ amount: value, line: {} });
    }
    if (method === 'cheque' && (!checkNumber.trim() || !bank.trim())) {
      setError('Completá número de cheque y banco.');
      return;
    }
    const done: ReceiptLine[] = [];
    try {
      for (const item of items) {
        const created = await createPayment(session.token, {
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          courierId: session.staff.id,
          courierName: session.staff.name,
          amount: item.amount,
          method,
          checkNumber: method === 'cheque' ? checkNumber.trim() : undefined,
          bank: method === 'cheque' ? bank.trim() : undefined,
          notes: notes.trim() || undefined,
          installmentId: item.installmentId,
        });
        done.push({ payment: created, ...item.line });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo registrar el cobro.';
      if (done.length > 0) {
        // Ya se registraron algunos: los mostramos para no cobrarlos dos veces.
        setReceipt(done);
        setError(`Se registraron ${done.length} de ${items.length} cobros. Falló uno: ${msg} Volvé a elegir el cliente para ver las cuotas que quedan.`);
        clearClient();
      } else {
        setError(msg);
      }
      return;
    }
    setReceipt(done);
    clearClient();
    setAmount('');
    setCheckNumber('');
    setBank('');
    setNotes('');
    setMethod('efectivo');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {receipt && (
        <div className="card" style={{ borderColor: '#4ade8033', background: '#0d2d1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontWeight: 700 }}>
            <CheckCircle2 size={18} /> {receipt.length > 1 ? `${receipt.length} cobros registrados` : 'Cobro registrado'}
          </div>
          <div style={{ color: '#fff', marginTop: 8 }}>
            {receipt[0].payment.clientName} — {fmt(receipt.reduce((sum, l) => sum + l.payment.amount, 0))} ({METHODS.find((m) => m.id === receipt[0].payment.method)?.label})
          </div>
          {receipt.length > 1 && (
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {receipt.map((l) => <div key={l.payment.id}>{l.detail ?? 'Pago general'}: {fmt(l.payment.amount)}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => printPaymentsReceipt(receipt)}>
              <Printer size={14} /> Imprimir recibo
            </button>
            <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => downloadPaymentsReceiptPdf(receipt)}>
              <Download size={14} /> Descargar PDF
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <label>Cliente</label>
        {selectedClient ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d2d1a', border: '1px solid #4ade8033', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>{selectedClient.name}</div>
              <div style={{ color: '#888', fontSize: 12 }}>{selectedClient.address}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {balance !== null ? (
                  <span style={{ color: balance > 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                    Saldo: {fmt(balance)}
                  </span>
                ) : (
                  <span style={{ color: '#666' }}>Consultando saldo...</span>
                )}
              </div>
            </div>
            <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={clearClient}>Cambiar</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input className="input-field" placeholder="Buscar por nombre o dirección..." value={query} onChange={(e) => setQuery(e.target.value)} />
            {suggestions.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
                {suggestions.map((c) => (
                  <div key={c.id} onClick={() => chooseClient(c)} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    <div style={{ color: '#fff', fontSize: 13 }}>{c.name}</div>
                    <div style={{ color: '#666', fontSize: 12 }}>{c.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedClient && pendingInstallments.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0 }}>Cuotas a cobrar (podés elegir varias)</label>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={toggleAll}>
              {allSelected ? 'Quitar todas' : 'Elegir todas'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {pendingInstallments.map((inst) => {
              const checked = inst.id in selected;
              return (
                <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${checked ? '#FE4806' : '#2d2d2d'}`, background: checked ? '#FE480610' : 'transparent' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer', flex: 1, margin: 0 }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleInstallment(inst)} />
                    <span style={{ flex: 1 }}>
                      Cuota {inst.number}/{inst.total}{inst.dueDate ? ` — vence ${fmtDueDate(inst.dueDate)}` : ''}
                      {inst.saleDescription ? ` — ${inst.saleDescription}` : ''}
                      {inst.paid > 0 ? ' (pago parcial)' : ''}
                      <span style={{ display: 'block', color: '#FE4806', fontWeight: 700, fontSize: 12 }}>debe {fmt(remainingOf(inst))}</span>
                    </span>
                  </label>
                  {checked && (
                    <input
                      className="input-field"
                      inputMode="decimal"
                      style={{ width: 110, textAlign: 'right' }}
                      value={selected[inst.id]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [inst.id]: e.target.value }))}
                      aria-label="Monto a cobrar de esta cuota"
                    />
                  )}
                </div>
              );
            })}
          </div>
          {selectedList.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #2d2d2d', color: '#fff', fontWeight: 700 }}>
              <span>Total a cobrar ({selectedList.length} cuota{selectedList.length !== 1 ? 's' : ''})</span>
              <span style={{ color: '#FE4806' }}>{fmt(selectedTotal)}</span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        {selectedList.length === 0 ? (
          <>
            <label>{pendingInstallments.length > 0 ? 'Monto (pago general, sin elegir cuotas)' : 'Monto'}</label>
            <input className="input-field" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 22, textAlign: 'center' }} />
          </>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, color: '#FE4806' }}>{fmt(selectedTotal)}</div>
        )}

        <label style={{ marginTop: 14 }}>Método de pago</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {METHODS.map((m) => (
            <button key={m.id} className={method === m.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setMethod(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        {method === 'cheque' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div>
              <label>Número de cheque</label>
              <input className="input-field" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
            </div>
            <div>
              <label>Banco</label>
              <input className="input-field" value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
          </div>
        )}

        <label style={{ marginTop: 14 }}>Observaciones (opcional)</label>
        <textarea className="input-field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={submit}>
        {selectedList.length > 1 ? `Registrar ${selectedList.length} cobros` : 'Registrar cobro'}
      </button>
    </div>
  );
}
