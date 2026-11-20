import { useEffect, useMemo, useState } from 'react';
import { Search, X, Banknote, ShoppingCart, UserRound, Trash2 } from 'lucide-react';
import { deletePayment, fetchClientAccounts, fetchClientStatement } from '../api';
import InstallmentsList from '../shared/InstallmentsList';
import { arToday, fmtShortDate } from '../shared/dateFormat';
import type { ClientAccount, ClientStatement } from '../types';

interface Props {
  token: string;
  canOpenStatement?: boolean;
  canDeletePayments?: boolean;
  /** Usuario actual cuando es repartidor/vendedor: la lista arranca filtrada en sus clientes. */
  mineId?: string;
}

type StatusFilter = 'todos' | 'deuda' | 'atrasados' | 'semana' | 'aldia';
type SortBy = 'deuda' | 'vencimiento' | 'atraso' | 'nombre';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'deuda', label: 'Con deuda' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'semana', label: 'Vencen esta semana' },
  { id: 'aldia', label: 'Sin deuda' },
];

const PAGE = 100;

/** Qué le toca pagar al cliente y cuándo, en una línea. */
function dueInfo(a: ClientAccount, today: string): { text: string; color: string } | null {
  if (a.overdue > 0.5) {
    const week = a.dueThisWeek > 0.5 ? ` · esta semana ${fmt(a.dueThisWeek)}` : '';
    return { text: `Atrasado ${fmt(a.overdue)} (${a.overdueCount} cuota${a.overdueCount !== 1 ? 's' : ''})${week}`, color: '#f87171' };
  }
  if (a.nextDue) {
    const amount = fmt(a.nextDueAmount ?? 0);
    if (a.nextDue < today) return { text: `Venció el ${fmtShortDate(a.nextDue)} · ${amount}`, color: '#fb923c' };
    if (a.nextDue === today) return { text: `Paga hoy · ${amount}`, color: '#fbbf24' };
    return { text: `Próximo pago ${fmtShortDate(a.nextDue)} · ${amount}`, color: '#9ca3af' };
  }
  if (a.balance > 0.5) return { text: 'Debe, sin plan de cuotas', color: '#9ca3af' };
  return null;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CuentasPanel({ token, canOpenStatement = true, canDeletePayments = false, mineId }: Props) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientAccount | null>(null);
  const [statement, setStatement] = useState<ClientStatement | null>(null);
  const [loading, setLoading] = useState(true);
  // 'mios' = los clientes del usuario actual (solo repartidor/vendedor); 'todos'; o el id de un vendedor.
  const [sellerFilter, setSellerFilter] = useState<string>(mineId ? 'mios' : 'todos');
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [sortBy, setSortBy] = useState<SortBy>('deuda');
  const filterKey = `${search}|${sellerFilter}|${status}|${sortBy}`;
  const [page, setPage] = useState({ key: filterKey, size: PAGE });
  const limit = page.key === filterKey ? page.size : PAGE;
  const today = arToday();

  function refresh() {
    fetchClientAccounts(token).then((rows) => { setAccounts(rows); setLoading(false); }).catch(() => setLoading(false));
  }

  useEffect(refresh, [token]);

  useEffect(() => {
    if (!selected) return;
    // Si se elige otro cliente antes de que llegue la respuesta, la vieja se descarta.
    let cancelled = false;
    fetchClientStatement(token, selected.id)
      .then((s) => { if (!cancelled) setStatement(s); })
      .catch(() => { if (!cancelled) setStatement(null); });
    return () => { cancelled = true; };
  }, [selected, token]);

  async function removePayment(paymentId: string, amount: number) {
    if (!selected || !confirm(`¿Eliminar el cobro de ${fmt(amount)} de ${selected.name}? La cuenta y las cuotas se recalculan.`)) return;
    try {
      await deletePayment(token, paymentId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo eliminar el cobro.');
      return;
    }
    refresh();
    fetchClientStatement(token, selected.id).then(setStatement).catch(() => setStatement(null));
    // el saldo del encabezado sale de la lista de cuentas: lo recalculamos con los datos nuevos
    fetchClientAccounts(token).then((rows) => {
      setAccounts(rows);
      setSelected(rows.find((r) => r.id === selected.id) ?? selected);
    }).catch(() => {});
  }

  function openAccount(a: ClientAccount) {
    setStatement(null);
    setSelected(a);
  }

  function closeAccount() {
    setSelected(null);
    setStatement(null);
  }

  const sellers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const a of accounts) {
      if (!a.sellerId) continue;
      const s = map.get(a.sellerId) ?? { id: a.sellerId, name: a.seller ?? a.sellerId, count: 0 };
      s.count += 1;
      map.set(a.sellerId, s);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [accounts]);

  // Cuentas del vendedor elegido: sobre estas se calculan los totales de arriba.
  const scoped = useMemo(() => {
    const sellerId = sellerFilter === 'mios' ? mineId : sellerFilter === 'todos' ? undefined : sellerFilter;
    return sellerId ? accounts.filter((a) => a.sellerId === sellerId) : accounts;
  }, [accounts, sellerFilter, mineId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byStatus = (a: ClientAccount) =>
      status === 'todos' ||
      (status === 'deuda' && a.balance > 0.5) ||
      (status === 'atrasados' && a.overdue > 0.5) ||
      (status === 'semana' && a.dueThisWeek > 0.5) ||
      (status === 'aldia' && a.balance <= 0.5);
    const far = '9999-12-31';
    const sorters: Record<SortBy, (a: ClientAccount, b: ClientAccount) => number> = {
      deuda: (a, b) => b.balance - a.balance,
      vencimiento: (a, b) => (a.nextDue ?? far).localeCompare(b.nextDue ?? far) || b.balance - a.balance,
      atraso: (a, b) => b.overdue - a.overdue || b.balance - a.balance,
      nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    };
    return scoped
      .filter(byStatus)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q) || (a.seller ?? '').toLowerCase().includes(q))
      .sort(sorters[sortBy]);
  }, [scoped, search, status, sortBy]);

  const totalDeuda = scoped.reduce((sum, a) => sum + Math.max(a.balance, 0), 0);
  const totalAtrasado = scoped.reduce((sum, a) => sum + a.overdue, 0);
  const totalSemana = scoped.reduce((sum, a) => sum + a.dueThisWeek, 0);
  const count = (f: (a: ClientAccount) => boolean) => scoped.filter(f).length;
  const visible = filtered.slice(0, limit);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '2 1 260px' }}>
          <Banknote size={22} color="#FE4806" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(totalDeuda)}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Total adeudado ({count((a) => a.balance > 0.5)} de {scoped.length} clientes con saldo pendiente)</div>
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 150px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: totalAtrasado > 0 ? '#f87171' : '#4ade80' }}>{fmt(totalAtrasado)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Atrasado ({count((a) => a.overdue > 0.5)} clientes)</div>
        </div>
        <div className="card" style={{ flex: '1 1 150px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{fmt(totalSemana)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Vence esta semana ({count((a) => a.dueThisWeek > 0.5)} clientes)</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por cliente, dirección o vendedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 'auto', flex: '0 1 220px' }} value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} aria-label="Vendedor">
          {mineId && <option value="mios">Mis clientes</option>}
          <option value="todos">Todos los vendedores ({accounts.length})</option>
          {sellers.filter((s) => s.id !== mineId).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
        </select>
        <select className="input-field" style={{ width: 'auto', flex: '0 1 200px' }} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} aria-label="Orden">
          <option value="deuda">Mayor deuda primero</option>
          <option value="vencimiento">Próximo vencimiento</option>
          <option value="atraso">Más atrasado primero</option>
          <option value="nombre">Por nombre</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className={status === f.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '5px 11px', fontSize: 12 }} onClick={() => setStatus(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#666', fontSize: 14 }}>Cargando cuentas...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay clientes que coincidan.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((a) => {
            const due = dueInfo(a, today);
            return (
              <div key={a.id} className="card" style={{ padding: 14, cursor: canOpenStatement ? 'pointer' : 'default' }} onClick={() => canOpenStatement && openAccount(a)}>
                {/* Nombre y saldo arriba; el resto abajo, así en el celular no se aprieta nada. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, minWidth: 0 }}>{a.name}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', color: a.balance > 0 ? '#f87171' : a.balance < 0 ? '#4ade80' : '#666' }}>
                    {fmt(a.balance)}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '2px 12px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#888', fontSize: 12 }}>{a.address}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginTop: 3, color: a.seller ? '#FE4806' : '#555' }}>
                      <UserRound size={12} /> {a.seller ? `Vendedor: ${a.seller}` : 'Sin vendedor asignado'}
                    </div>
                    {due && <div style={{ fontSize: 12, marginTop: 3, color: due.color, fontWeight: 600 }}>{due.text}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>vendido {fmt(a.charged)} · pagado {fmt(a.paid)}</div>
                </div>
              </div>
            );
          })}
          {filtered.length > visible.length && (
            <button className="btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setPage({ key: filterKey, size: limit + PAGE })}>
              Mostrar más ({visible.length} de {filtered.length})
            </button>
          )}
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={closeAccount}>
          <div className="card" style={{ maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{selected.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{selected.address}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginTop: 4, color: selected.seller ? '#FE4806' : '#555' }}>
                  <UserRound size={12} /> {selected.seller ? `Vendedor: ${selected.seller}` : 'Sin vendedor asignado'}
                </div>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={closeAccount}><X size={14} /></button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div className="stat-card" style={{ flex: 1, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(selected.balance)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>Saldo</div>
              </div>
              <div className="stat-card" style={{ flex: 1, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(selected.charged)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>Vendido</div>
              </div>
              <div className="stat-card" style={{ flex: 1, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(selected.paid)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>Pagado</div>
              </div>
            </div>

            {!statement ? (
              <p style={{ color: '#666', fontSize: 13 }}>Cargando movimientos...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ...statement.sales.map((s) => ({ ...s, kind: 'venta' as const })),
                  ...statement.payments.map((p) => ({ ...p, kind: 'pago' as const })),
                ]
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((entry) => (
                    <div key={`${entry.kind}-${entry.id}`} style={{ padding: '8px 10px', borderRadius: 8, background: '#141414' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {entry.kind === 'venta' ? <ShoppingCart size={14} color="#f87171" /> : <Banknote size={14} color="#4ade80" />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: 13 }}>{entry.kind === 'venta' ? (entry.description || 'Venta cargada') : 'Cobro'}</div>
                          {entry.items && entry.items.length > 0 && (
                            <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>
                              {entry.items.map((it) => `${it.quantity} × ${it.description}`).join(' · ')}
                            </div>
                          )}
                          <div style={{ color: '#666', fontSize: 11 }}>{entry.courierName} · {fmtDate(entry.createdAt)}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: entry.kind === 'venta' ? '#f87171' : '#4ade80' }}>
                          {entry.kind === 'venta' ? '+' : '-'}{fmt(entry.amount)}
                        </div>
                        {canDeletePayments && entry.kind === 'pago' && (
                          <button className="btn-danger" style={{ padding: '4px 8px', flexShrink: 0 }} title="Eliminar cobro" onClick={() => void removePayment(entry.id, entry.amount)}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      {entry.kind === 'venta' && entry.installments && entry.installments.length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #222' }}>
                          <InstallmentsList installments={entry.installments} total={entry.installmentsTotal ?? entry.installments.length} />
                        </div>
                      )}
                    </div>
                  ))}
                {statement.sales.length === 0 && statement.payments.length === 0 && (
                  <p style={{ color: '#666', fontSize: 13 }}>Sin movimientos todavía.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
