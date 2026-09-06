import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react';
import {
  createSupplier,
  createSupplierDebt,
  deleteSupplier,
  deleteSupplierDebt,
  fetchSuppliers,
  fetchSupplierDebts,
  paySupplierDebt,
} from '../api';
import type { Supplier, SupplierDebt, SupplierPaymentMethod } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const METHOD_LABEL: Record<SupplierPaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  echeq: 'ECHEQ',
  otro: 'Otro',
};

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(`${dueDate}T00:00:00`) < new Date(new Date().toDateString());
}

export default function ProveedoresPanel({ token }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [debts, setDebts] = useState<SupplierDebt[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pendiente' | 'pagado' | 'todos'>('pendiente');

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');

  const [showDebtForm, setShowDebtForm] = useState(false);
  const [debtSupplierId, setDebtSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<SupplierPaymentMethod>('transferencia');
  const [echeqNumber, setEcheqNumber] = useState('');
  const [echeqDate, setEcheqDate] = useState('');
  const [payError, setPayError] = useState('');

  function refresh() {
    fetchSuppliers(token).then(setSuppliers).catch(() => {});
    fetchSupplierDebts(token).then(setDebts).catch(() => {});
  }

  useEffect(refresh, [token]);

  const filteredDebts = useMemo(
    () => debts.filter((d) => statusFilter === 'todos' || d.status === statusFilter),
    [debts, statusFilter]
  );

  const totalPendiente = debts.filter((d) => d.status === 'pendiente').reduce((sum, d) => sum + d.amount, 0);

  async function saveSupplier() {
    if (!supplierName.trim()) return;
    const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await createSupplier(token, { id, name: supplierName.trim(), phone: supplierPhone.trim() || undefined });
    setSupplierName('');
    setSupplierPhone('');
    setShowSupplierForm(false);
    refresh();
  }

  async function removeSupplier(s: Supplier) {
    if (!confirm(`¿Eliminar el proveedor ${s.name}?`)) return;
    await deleteSupplier(token, s.id);
    refresh();
  }

  function openDebtForm() {
    setDebtSupplierId('');
    setInvoiceNumber('');
    setAmount('');
    setIssueDate('');
    setDueDate('');
    setNotes('');
    setError('');
    setShowDebtForm(true);
  }

  async function saveDebt() {
    const supplier = suppliers.find((s) => s.id === debtSupplierId);
    const value = Number(amount.replace(',', '.'));
    if (!supplier) { setError('Elegí un proveedor.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Ingresá un monto válido.'); return; }
    try {
      await createSupplierDebt(token, {
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceNumber: invoiceNumber.trim() || undefined,
        amount: value,
        issueDate: issueDate || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });
      setShowDebtForm(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la deuda.');
    }
  }

  function openPay(d: SupplierDebt) {
    setPayingId(d.id);
    setPayMethod('transferencia');
    setEcheqNumber('');
    setEcheqDate('');
    setPayError('');
  }

  async function confirmPay(d: SupplierDebt) {
    if (payMethod === 'echeq' && !echeqNumber.trim()) {
      setPayError('Ingresá el número de ECHEQ.');
      return;
    }
    try {
      await paySupplierDebt(token, d.id, {
        paymentMethod: payMethod,
        echeqNumber: payMethod === 'echeq' ? echeqNumber.trim() : undefined,
        echeqDate: payMethod === 'echeq' ? echeqDate || undefined : undefined,
      });
      setPayingId(null);
      refresh();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
    }
  }

  async function removeDebt(d: SupplierDebt) {
    if (!confirm(`¿Eliminar la deuda de ${fmt(d.amount)} con ${d.supplierName}?`)) return;
    await deleteSupplierDebt(token, d.id);
    refresh();
  }

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <AlertTriangle size={22} color="#f87171" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(totalPendiente)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Total pendiente con proveedores</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={15} color="#FFE000" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Proveedores</span>
        </div>
        <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setShowSupplierForm((v) => !v)}>
          <Plus size={13} /> Nuevo proveedor
        </button>
      </div>

      {showSupplierForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Nombre</label>
              <input className="input-field" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </div>
            <div>
              <label>Teléfono (opcional)</label>
              <input className="input-field" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowSupplierForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={saveSupplier}>Guardar</button>
          </div>
        </div>
      )}

      {suppliers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {suppliers.map((s) => (
            <div key={s.id} className="badge badge-gray" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {s.name}{s.phone ? ` · ${s.phone}` : ''}
              <button onClick={() => removeSupplier(s)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <select className="input-field" style={{ width: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="pendiente">Pendientes</option>
          <option value="pagado">Pagadas</option>
          <option value="todos">Todas</option>
        </select>
        <button className="btn-primary" onClick={openDebtForm}><Plus size={14} /> Cargar deuda</button>
      </div>

      {showDebtForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Proveedor</label>
              <select className="input-field" value={debtSupplierId} onChange={(e) => setDebtSupplierId(e.target.value)}>
                <option value="">Elegir...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label>N° de factura</label>
              <input className="input-field" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <label>Monto</label>
              <input className="input-field" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label>Fecha de factura</label>
              <input className="input-field" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label>Fecha de vencimiento</label>
              <input className="input-field" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notas</label>
              <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowDebtForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={saveDebt}>Guardar deuda</button>
          </div>
        </div>
      )}

      {filteredDebts.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay deudas para mostrar.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredDebts.map((d) => (
            <div key={d.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{d.supplierName}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>
                    {d.invoiceNumber ? `Factura ${d.invoiceNumber} · ` : ''}
                    {d.issueDate ? `Emitida ${d.issueDate} · ` : ''}
                    {d.dueDate ? `Vence ${d.dueDate}` : 'Sin vencimiento'}
                  </div>
                  {d.status === 'pagado' && (
                    <div style={{ color: '#4ade80', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> Pagada · {d.paymentMethod ? METHOD_LABEL[d.paymentMethod] : ''}
                      {d.paymentMethod === 'echeq' && d.echeqNumber ? ` #${d.echeqNumber}${d.echeqDate ? ` (${d.echeqDate})` : ''}` : ''}
                    </div>
                  )}
                  {d.notes && <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{d.notes}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{fmt(d.amount)}</div>
                  {d.status === 'pendiente' && isOverdue(d.dueDate) && (
                    <span className="badge badge-red" style={{ marginTop: 4, display: 'inline-block' }}>Vencida</span>
                  )}
                </div>
              </div>

              {d.status === 'pendiente' && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2d2d2d' }}>
                  {payingId === d.id ? (
                    <div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {(Object.keys(METHOD_LABEL) as SupplierPaymentMethod[]).map((m) => (
                          <button key={m} className={payMethod === m ? 'btn-primary' : 'btn-secondary'} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setPayMethod(m)}>
                            {METHOD_LABEL[m]}
                          </button>
                        ))}
                      </div>
                      {payMethod === 'echeq' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label>N° de ECHEQ</label>
                            <input className="input-field" value={echeqNumber} onChange={(e) => setEcheqNumber(e.target.value)} />
                          </div>
                          <div>
                            <label>Fecha de pago del ECHEQ</label>
                            <input className="input-field" type="date" value={echeqDate} onChange={(e) => setEcheqDate(e.target.value)} />
                          </div>
                        </div>
                      )}
                      {payError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{payError}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setPayingId(null)}>Cancelar</button>
                        <button className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => confirmPay(d)}>Confirmar pago</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openPay(d)}>Marcar como pagada</button>
                      <button className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => removeDebt(d)}><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
