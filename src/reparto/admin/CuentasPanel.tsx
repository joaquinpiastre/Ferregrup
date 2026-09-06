import { useEffect, useMemo, useState } from 'react';
import { Search, X, Banknote, ShoppingCart } from 'lucide-react';
import { fetchClientAccounts, fetchClientStatement } from '../api';
import type { ClientAccount, ClientStatement } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CuentasPanel({ token }: Props) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientAccount | null>(null);
  const [statement, setStatement] = useState<ClientStatement | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    fetchClientAccounts(token).then((rows) => { setAccounts(rows); setLoading(false); }).catch(() => setLoading(false));
  }

  useEffect(refresh, [token]);

  useEffect(() => {
    if (!selected) return;
    fetchClientStatement(token, selected.id).then(setStatement).catch(() => setStatement(null));
  }, [selected, token]);

  function openAccount(a: ClientAccount) {
    setStatement(null);
    setSelected(a);
  }

  function closeAccount() {
    setSelected(null);
    setStatement(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q))
      .sort((a, b) => b.balance - a.balance);
  }, [accounts, search]);

  const totalDeuda = accounts.reduce((sum, a) => sum + Math.max(a.balance, 0), 0);

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Banknote size={22} color="#FFE000" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(totalDeuda)}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Total adeudado por clientes ({accounts.filter((a) => a.balance > 0).length} con saldo pendiente)</div>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar cliente por nombre o dirección..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p style={{ color: '#666', fontSize: 14 }}>Cargando cuentas...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay clientes que coincidan.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((a) => (
            <div key={a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }} onClick={() => openAccount(a)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{a.address}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: a.balance > 0 ? '#f87171' : a.balance < 0 ? '#4ade80' : '#666' }}>
                  {fmt(a.balance)}
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>vendido {fmt(a.charged)} · pagado {fmt(a.paid)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={closeAccount}>
          <div className="card" style={{ maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{selected.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{selected.address}</div>
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
                    <div key={`${entry.kind}-${entry.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#141414' }}>
                      {entry.kind === 'venta' ? <ShoppingCart size={14} color="#f87171" /> : <Banknote size={14} color="#4ade80" />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: 13 }}>{entry.kind === 'venta' ? (entry.description || 'Venta cargada') : 'Cobro'}</div>
                        <div style={{ color: '#666', fontSize: 11 }}>{entry.courierName} · {fmtDate(entry.createdAt)}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: entry.kind === 'venta' ? '#f87171' : '#4ade80' }}>
                        {entry.kind === 'venta' ? '+' : '-'}{fmt(entry.amount)}
                      </div>
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
