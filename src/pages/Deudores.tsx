import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, DollarSign, User, Building2, AlertCircle, Calendar, CheckCircle2 } from 'lucide-react';
import type { Debtor, ClientType, PaymentFrequency, AppData, DebtPayment } from '../types';
import { generateId, advancePaymentDate, isOverdue } from '../store';

interface Props { data: AppData; onChange: (d: AppData) => void; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const TODAY = '2026-05-12';

const emptyDebtor = (): Omit<Debtor, 'id' | 'createdAt' | 'payments' | 'status' | 'amountPaid'> => ({
  type: 'persona', name: '', company: '', phone: '', email: '', address: '',
  cuit: '', totalDebt: 0, installmentAmount: 0, paymentFrequency: 'mensual',
  nextPaymentDate: TODAY, notes: '',
});

export default function Deudores({ data, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Debtor | null>(null);
  const [form, setForm] = useState(emptyDebtor());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<Debtor | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const debtors = data.debtors.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.name.toLowerCase().includes(q) || (d.company || '').toLowerCase().includes(q) || d.phone.includes(q);
    const matchType = !typeFilter || d.type === typeFilter;
    const matchStatus = !statusFilter || d.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  }).sort((a, b) => {
    // Overdue first, then activo, then parcial, then pagado
    const priority = (d: Debtor) => {
      if (d.status === 'pagado') return 3;
      if (isOverdue(d.nextPaymentDate)) return 0;
      if (d.status === 'activo') return 1;
      return 2;
    };
    return priority(a) - priority(b);
  });

  const totalPending = data.debtors.filter(d => d.status !== 'pagado').reduce((s, d) => s + (d.totalDebt - d.amountPaid), 0);
  const overdueCount = data.debtors.filter(d => d.status !== 'pagado' && isOverdue(d.nextPaymentDate)).length;
  const paidCount = data.debtors.filter(d => d.status === 'pagado').length;

  function openAdd() {
    setEditing(null);
    setForm(emptyDebtor());
    setShowModal(true);
  }

  function openEdit(d: Debtor) {
    setEditing(d);
    setForm({
      type: d.type, name: d.name, company: d.company || '', phone: d.phone,
      email: d.email, address: d.address, cuit: d.cuit || '',
      totalDebt: d.totalDebt, installmentAmount: d.installmentAmount,
      paymentFrequency: d.paymentFrequency, nextPaymentDate: d.nextPaymentDate, notes: d.notes,
    });
    setShowModal(true);
  }

  function handleSave() {
    if (editing) {
      const newRemaining = form.totalDebt - editing.amountPaid;
      const newStatus = newRemaining <= 0 ? 'pagado' : editing.amountPaid > 0 ? 'parcial' : 'activo';
      onChange({ ...data, debtors: data.debtors.map(d => d.id === editing.id ? { ...d, ...form, status: newStatus as Debtor['status'] } : d) });
    } else {
      const newD: Debtor = { ...form, id: generateId(), amountPaid: 0, payments: [], status: 'activo', createdAt: TODAY };
      onChange({ ...data, debtors: [...data.debtors, newD] });
    }
    setShowModal(false);
  }

  function openPayModal(d: Debtor) {
    setPayModal(d);
    setPayAmount(d.installmentAmount > 0 ? String(d.installmentAmount) : '');
    setPayNote(`Cuota ${d.paymentFrequency === 'semanal' ? 'semana' : 'mes'} ${TODAY}`);
  }

  function handlePayment() {
    if (!payModal) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;

    const payment: DebtPayment = { id: generateId(), amount, date: TODAY, note: payNote };
    const newPaid = payModal.amountPaid + amount;
    const newStatus: Debtor['status'] = newPaid >= payModal.totalDebt ? 'pagado' : 'parcial';
    const newNextDate = newPaid < payModal.totalDebt
      ? advancePaymentDate(payModal.nextPaymentDate, payModal.paymentFrequency)
      : payModal.nextPaymentDate;

    onChange({
      ...data,
      debtors: data.debtors.map(d =>
        d.id === payModal.id
          ? { ...d, amountPaid: newPaid, status: newStatus, nextPaymentDate: newNextDate, payments: [...d.payments, payment] }
          : d
      ),
    });
    setPayModal(null);
    setPayAmount('');
    setPayNote('');
  }

  function handleDelete(id: string) {
    onChange({ ...data, debtors: data.debtors.filter(d => d.id !== id) });
    setDeleteId(null);
  }

  const statusStyles: Record<string, string> = { activo: 'badge-red', parcial: 'badge-yellow', pagado: 'badge-green' };
  const statusLabels: Record<string, string> = { activo: 'Sin pagar', parcial: 'Parcial', pagado: 'Pagado' };

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Deudores</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{data.debtors.length} clientes registrados · {TODAY}</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Nuevo Deudor</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <MiniStat label="Deuda total pendiente" value={fmt(totalPending)} color="#f87171" />
        <MiniStat label="Cuotas vencidas" value={`${overdueCount} clientes`} color="#fb923c" />
        <MiniStat label="Cuentas saldadas" value={`${paidCount} clientes`} color="#4ade80" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por nombre, empresa o teléfono..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 150 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="persona">Persona</option>
          <option value="empresa">Empresa</option>
        </select>
        <select className="input-field" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activo">Sin pagar</option>
          <option value="parcial">Parcial</option>
          <option value="pagado">Pagado</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {debtors.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#555', padding: 40 }}>
            <User size={32} color="#333" style={{ margin: '0 auto 8px', display: 'block' }} />
            No se encontraron deudores
          </div>
        )}
        {debtors.map(d => {
          const remaining = d.totalDebt - d.amountPaid;
          const pct = d.totalDebt > 0 ? Math.min((d.amountPaid / d.totalDebt) * 100, 100) : 0;
          const isExpanded = expanded === d.id;
          const overdue = d.status !== 'pagado' && isOverdue(d.nextPaymentDate);

          return (
            <div key={d.id} style={{
              background: '#1a1a1a',
              border: `1px solid ${overdue ? '#fb923c44' : '#2d2d2d'}`,
              borderRadius: 12,
              overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}>
              {/* Overdue banner */}
              {overdue && (
                <div style={{ background: '#2d1800', borderBottom: '1px solid #fb923c33', padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={13} color="#fb923c" />
                  <span style={{ fontSize: 12, color: '#fb923c', fontWeight: 600 }}>
                    Cuota vencida desde el {d.nextPaymentDate}
                  </span>
                </div>
              )}

              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : d.id)}>
                {/* Icon */}
                <div style={{
                  width: 42, height: 42,
                  background: d.type === 'empresa' ? '#0d1a2d' : '#1a1025',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {d.type === 'empresa' ? <Building2 size={18} color="#60a5fa" /> : <User size={18} color="#a78bfa" />}
                </div>

                {/* Name + badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>{d.name}</span>
                    {d.company && <span style={{ color: '#555', fontSize: 12 }}>· {d.company}</span>}
                    <span className={`badge ${statusStyles[d.status]}`}>{statusLabels[d.status]}</span>
                    <span className={`badge ${d.paymentFrequency === 'semanal' ? 'badge-yellow' : 'badge-blue'}`}>
                      {d.paymentFrequency}
                    </span>
                    {overdue && <span className="badge badge-orange">⚠ Vencida</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    {d.phone}{d.email && ` · ${d.email}`}
                  </div>
                </div>

                {/* Cuota info */}
                {d.status !== 'pagado' && d.installmentAmount > 0 && (
                  <div style={{ textAlign: 'center', flexShrink: 0, background: '#111', borderRadius: 8, padding: '6px 12px' }}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>Cuota</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#FFE000' }}>{fmt(d.installmentAmount)}</div>
                  </div>
                )}

                {/* Next payment */}
                {d.status !== 'pagado' && (
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <Calendar size={10} /> Próximo cobro
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: overdue ? '#fb923c' : '#aaa' }}>
                      {d.nextPaymentDate}
                    </div>
                  </div>
                )}
                {d.status === 'pagado' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Saldado
                  </div>
                )}

                {/* Progress */}
                <div style={{ width: 100, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginBottom: 3 }}>
                    <span>Pagado</span><span>{Math.round(pct)}%</span>
                  </div>
                  <div style={{ height: 5, background: '#2d2d2d', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#4ade80' : '#FFE000', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>

                {/* Debt amount */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: remaining > 0 ? '#f87171' : '#4ade80' }}>
                    {fmt(remaining)}
                  </div>
                  <div style={{ fontSize: 10, color: '#444' }}>de {fmt(d.totalDebt)}</div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {d.status !== 'pagado' && (
                    <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openPayModal(d)}>
                      <DollarSign size={13} /> Cobrar cuota
                    </button>
                  )}
                  <button className="btn-secondary" style={{ padding: '5px 8px' }} onClick={() => openEdit(d)}><Edit2 size={14} /></button>
                  <button className="btn-danger" style={{ padding: '5px 8px' }} onClick={() => setDeleteId(d.id)}><Trash2 size={14} /></button>
                </div>

                {isExpanded ? <ChevronUp size={16} color="#555" /> : <ChevronDown size={16} color="#555" />}
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #222', padding: '16px 20px', background: '#111' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
                    {d.cuit && (
                      <div>
                        <div style={{ fontSize: 11, color: '#555', marginBottom: 3 }}>CUIT</div>
                        <div style={{ color: '#aaa', fontSize: 13 }}>{d.cuit}</div>
                      </div>
                    )}
                    {d.address && (
                      <div>
                        <div style={{ fontSize: 11, color: '#555', marginBottom: 3 }}>Dirección</div>
                        <div style={{ color: '#aaa', fontSize: 13 }}>{d.address}</div>
                      </div>
                    )}
                    {d.notes && (
                      <div style={{ gridColumn: d.cuit && d.address ? '1 / -1' : 'auto' }}>
                        <div style={{ fontSize: 11, color: '#555', marginBottom: 3 }}>Notas</div>
                        <div style={{ color: '#aaa', fontSize: 13 }}>{d.notes}</div>
                      </div>
                    )}
                  </div>

                  {/* Payment history */}
                  {d.payments.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Historial de pagos ({d.payments.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                        {[...d.payments].reverse().map((p, idx) => (
                          <div key={p.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', background: '#1a1a1a', borderRadius: 7,
                            border: '1px solid #222',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 22, height: 22, background: '#0d2d1a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <CheckCircle2 size={12} color="#4ade80" />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, color: '#ccc', fontWeight: 500 }}>{p.note || `Pago #${d.payments.length - idx}`}</div>
                                <div style={{ fontSize: 11, color: '#555' }}>{p.date}</div>
                              </div>
                            </div>
                            <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>+{fmt(p.amount)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.payments.length === 0 && (
                    <div style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Sin pagos registrados aún</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 20, fontSize: 18 }}>{editing ? 'Editar Deudor' : 'Nuevo Deudor'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Tipo de cliente</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['persona', 'empresa'] as ClientType[]).map(t => (
                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8,
                        border: `1px solid ${form.type === t ? '#FFE000' : '#3d3d3d'}`,
                        background: form.type === t ? '#2d2500' : '#222',
                        color: form.type === t ? '#FFE000' : '#aaa',
                        cursor: 'pointer', fontWeight: 600, fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}>
                      {t === 'persona' ? <User size={14} /> : <Building2 size={14} />}
                      {t === 'persona' ? 'Persona Física' : 'Empresa'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label>Nombre *</label>
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
              </div>
              {form.type === 'empresa' && (
                <div>
                  <label>Razón social</label>
                  <input className="input-field" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Empresa S.R.L." />
                </div>
              )}
              <div>
                <label>Teléfono</label>
                <input className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="011-1234-5678" />
              </div>
              <div>
                <label>Email</label>
                <input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Dirección</label>
                <input className="input-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle 123, Ciudad" />
              </div>
              {form.type === 'empresa' && (
                <div>
                  <label>CUIT</label>
                  <input className="input-field" value={form.cuit} onChange={e => setForm({ ...form, cuit: e.target.value })} placeholder="30-12345678-9" />
                </div>
              )}
              <div>
                <label>Deuda total ($)</label>
                <input className="input-field" type="number" min={0} value={form.totalDebt} onChange={e => setForm({ ...form, totalDebt: Number(e.target.value) })} />
              </div>
              <div>
                <label>Monto de cuota ($)</label>
                <input className="input-field" type="number" min={0} value={form.installmentAmount} onChange={e => setForm({ ...form, installmentAmount: Number(e.target.value) })} placeholder="Cuánto paga por período" />
              </div>
              <div>
                <label>Frecuencia de pago</label>
                <select className="input-field" value={form.paymentFrequency} onChange={e => setForm({ ...form, paymentFrequency: e.target.value as PaymentFrequency })}>
                  <option value="semanal">Semanal (cada 7 días)</option>
                  <option value="mensual">Mensual (cada 1 mes)</option>
                </select>
              </div>
              <div>
                <label>Fecha del próximo cobro</label>
                <input className="input-field" type="date" value={form.nextPaymentDate} onChange={e => setForm({ ...form, nextPaymentDate: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notas</label>
                <textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones adicionales..." style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.name}>
                {editing ? 'Guardar cambios' : 'Agregar deudor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ── */}
      {payModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, background: '#0d2d1a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={18} color="#4ade80" />
              </div>
              <div>
                <h2 style={{ color: '#fff', fontSize: 17, marginBottom: 1 }}>Registrar cobro de cuota</h2>
                <div style={{ fontSize: 12, color: '#555' }}>{payModal.paymentFrequency === 'semanal' ? 'Pago semanal' : 'Pago mensual'}</div>
              </div>
            </div>

            {/* Client summary */}
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: 2 }}>{payModal.name}</div>
                  {payModal.company && <div style={{ fontSize: 12, color: '#555' }}>{payModal.company}</div>}
                </div>
                <span className={`badge ${payModal.paymentFrequency === 'semanal' ? 'badge-yellow' : 'badge-blue'}`}>
                  {payModal.paymentFrequency}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>Deuda restante</div>
                  <div style={{ fontWeight: 700, color: '#f87171', fontSize: 15 }}>{fmt(payModal.totalDebt - payModal.amountPaid)}</div>
                </div>
                {payModal.installmentAmount > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>Cuota pactada</div>
                    <div style={{ fontWeight: 700, color: '#FFE000', fontSize: 15 }}>{fmt(payModal.installmentAmount)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>Próximo cobro actual</div>
                  <div style={{ fontWeight: 600, color: isOverdue(payModal.nextPaymentDate) ? '#fb923c' : '#aaa', fontSize: 13 }}>
                    {payModal.nextPaymentDate}
                    {isOverdue(payModal.nextPaymentDate) && ' ⚠'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label>Monto recibido ($) *</label>
              <input
                className="input-field"
                type="number"
                min={0}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder={payModal.installmentAmount > 0 ? `Cuota: ${fmt(payModal.installmentAmount)}` : '0'}
                autoFocus
                style={{ fontSize: 18, fontWeight: 700 }}
              />
              {payModal.installmentAmount > 0 && Number(payAmount) !== payModal.installmentAmount && Number(payAmount) > 0 && (
                <div style={{ fontSize: 11, color: '#fb923c', marginTop: 4 }}>
                  Diferente a la cuota pactada de {fmt(payModal.installmentAmount)}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label>Nota / referencia</label>
              <input className="input-field" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder={`Cuota ${payModal.paymentFrequency === 'semanal' ? 'semana' : 'mes'} ${TODAY}`} />
            </div>

            {/* Preview of next date */}
            {Number(payAmount) > 0 && payModal.amountPaid + Number(payAmount) < payModal.totalDebt && (
              <div style={{ background: '#0d2500', border: '1px solid #4ade8022', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                <span style={{ color: '#555' }}>Próximo cobro programado: </span>
                <span style={{ color: '#4ade80', fontWeight: 600 }}>
                  {advancePaymentDate(payModal.nextPaymentDate, payModal.paymentFrequency)}
                </span>
              </div>
            )}
            {Number(payAmount) > 0 && payModal.amountPaid + Number(payAmount) >= payModal.totalDebt && (
              <div style={{ background: '#0d2d1a', border: '1px solid #4ade8033', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#4ade80" />
                <span style={{ color: '#4ade80', fontWeight: 600 }}>¡Con este pago la deuda queda saldada!</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setPayModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handlePayment} disabled={!payAmount || Number(payAmount) <= 0}>
                <CheckCircle2 size={15} /> Confirmar cobro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Trash2 size={40} color="#f87171" style={{ margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ color: '#fff', marginBottom: 8 }}>¿Eliminar deudor?</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Se perderá todo el historial de pagos.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#1a1a1a', border: `1px solid ${color}22`, borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
