import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { createPayment, subscribeClients } from '../api';
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
  const [receipt, setReceipt] = useState<{ clientName: string; amount: number; method: PaymentMethod } | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 6);
  }, [clients, query]);

  async function submit() {
    setError('');
    const value = Number(amount.replace(',', '.'));
    if (!selectedClient) {
      setError('Elegí un cliente.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Ingresá un monto válido.');
      return;
    }
    if (method === 'cheque' && (!checkNumber.trim() || !bank.trim())) {
      setError('Completá número de cheque y banco.');
      return;
    }
    try {
      await createPayment(session.token, {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        courierId: session.staff.id,
        courierName: session.staff.name,
        amount: value,
        method,
        checkNumber: method === 'cheque' ? checkNumber.trim() : undefined,
        bank: method === 'cheque' ? bank.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      setReceipt({ clientName: selectedClient.name, amount: value, method });
      setSelectedClient(null);
      setAmount('');
      setCheckNumber('');
      setBank('');
      setNotes('');
      setMethod('efectivo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {receipt && (
        <div className="card" style={{ borderColor: '#4ade8033', background: '#0d2d1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontWeight: 700 }}>
            <CheckCircle2 size={18} /> Cobro registrado
          </div>
          <div style={{ color: '#fff', marginTop: 8 }}>{receipt.clientName} — {fmt(receipt.amount)} ({METHODS.find((m) => m.id === receipt.method)?.label})</div>
        </div>
      )}

      <div className="card">
        <label>Cliente</label>
        {selectedClient ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d2d1a', border: '1px solid #4ade8033', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>{selectedClient.name}</div>
              <div style={{ color: '#888', fontSize: 12 }}>{selectedClient.address}</div>
            </div>
            <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedClient(null)}>Cambiar</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input className="input-field" placeholder="Buscar por nombre o dirección..." value={query} onChange={(e) => setQuery(e.target.value)} />
            {suggestions.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
                {suggestions.map((c) => (
                  <div key={c.id} onClick={() => { setSelectedClient(c); setQuery(''); }} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    <div style={{ color: '#fff', fontSize: 13 }}>{c.name}</div>
                    <div style={{ color: '#666', fontSize: 12 }}>{c.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <label>Monto</label>
        <input className="input-field" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 22, textAlign: 'center' }} />

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
        Registrar cobro
      </button>
    </div>
  );
}
