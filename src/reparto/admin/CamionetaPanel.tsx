import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Check, PackageMinus, Plus, Search, Truck, Undo2, X } from 'lucide-react';
import { fetchCatalog, fetchStaffList, fetchVan, moveVanStock } from '../api';
import type { CatalogProduct, Staff, VanItem, VanMovement, VanMovementKind } from '../types';

interface Props {
  token: string;
}

const KIND_LABEL: Record<VanMovementKind, string> = {
  carga: 'Carga',
  devolucion: 'Devolución',
  muestra: 'Muestra',
};

const KIND_BADGE: Record<VanMovementKind, string> = {
  carga: 'badge-green',
  devolucion: 'badge-blue',
  muestra: 'badge-red',
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CamionetaPanel({ token }: Props) {
  const [items, setItems] = useState<VanItem[]>([]);
  const [movements, setMovements] = useState<VanMovement[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // carga
  const [showLoad, setShowLoad] = useState(false);
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loadQty, setLoadQty] = useState('1');
  const [courierId, setCourierId] = useState('');
  const [loadNotes, setLoadNotes] = useState('');

  // devolución / muestra sobre un ítem de la camioneta
  const [acting, setActing] = useState<{ code: string; kind: 'devolucion' | 'muestra' } | null>(null);
  const [actQty, setActQty] = useState('');
  const [actNotes, setActNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    fetchVan(token)
      .then((d) => { setItems(d.items); setMovements(d.movements); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la camioneta.'))
      .finally(() => setLoading(false));
    fetchCatalog(token).then(setCatalog).catch(() => {});
  }, [token]);

  useEffect(refresh, [refresh]);
  useEffect(() => { fetchStaffList(token).then(setStaff).catch(() => {}); }, [token]);

  const couriers = useMemo(() => staff.filter((s) => s.role === 'repartidor'), [staff]);
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog.filter((p) => p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 8);
  }, [catalog, query]);

  function openLoad() {
    setShowLoad(true);
    setQuery('');
    setProduct(null);
    setLoadQty('1');
    setCourierId('');
    setLoadNotes('');
    setError('');
  }

  async function submitLoad() {
    if (saving) return;
    const quantity = parseInt(loadQty, 10);
    if (!product) { setError('Elegí un producto.'); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setError('Ingresá una cantidad válida.'); return; }
    setSaving(true);
    setError('');
    try {
      await moveVanStock(token, { code: product.code, quantity, kind: 'carga', courierId: courierId || undefined, notes: loadNotes.trim() || undefined });
      setProduct(null);
      setQuery('');
      setLoadQty('1');
      setLoadNotes('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar a la camioneta.');
    } finally {
      setSaving(false);
    }
  }

  function startAct(code: string, kind: 'devolucion' | 'muestra') {
    setActing({ code, kind });
    setActQty('');
    setActNotes('');
    setError('');
  }

  async function submitAct() {
    if (!acting || saving) return;
    const quantity = parseInt(actQty, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) { setError('Ingresá una cantidad válida.'); return; }
    setSaving(true);
    setError('');
    try {
      await moveVanStock(token, { code: acting.code, quantity, kind: acting.kind, notes: actNotes.trim() || undefined });
      setActing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Truck size={22} color="#FE4806" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{totalUnits} unidades</div>
          <div style={{ fontSize: 12, color: '#888' }}>{items.length} producto{items.length !== 1 ? 's' : ''} en la camioneta</div>
        </div>
        <button className={showLoad ? 'btn-secondary' : 'btn-primary'} onClick={() => (showLoad ? setShowLoad(false) : openLoad())}>
          {showLoad ? <><X size={14} /> Cerrar</> : <><Plus size={14} /> Cargar mercadería</>}
        </button>
      </div>

      {showLoad && (
        <div className="card" style={{ marginBottom: 16, maxWidth: 560 }}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
            La mercadería que cargás sale del stock del depósito y pasa a la camioneta.
          </div>

          <label>Producto</label>
          {product ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d2d1a', border: '1px solid #4ade8033', borderRadius: 10, padding: '10px 12px' }}>
              <div>
                <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>{product.description}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{product.code} · en depósito: {product.stock}</div>
              </div>
              <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setProduct(null)}>Cambiar</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por código o descripción..." value={query} onChange={(e) => setQuery(e.target.value)} />
              {suggestions.length > 0 && (
                <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
                  {suggestions.map((p) => (
                    <div key={p.code} onClick={() => { setProduct(p); setQuery(''); }} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>
                      <div style={{ color: '#fff', fontSize: 13 }}>{p.description}</div>
                      <div style={{ color: '#666', fontSize: 12 }}>{p.code} · depósito: {p.stock}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 14 }}>
            <div>
              <label>Cantidad</label>
              <input className="input-field" inputMode="numeric" value={loadQty} onChange={(e) => setLoadQty(e.target.value)} />
            </div>
            <div>
              <label>Se lo lleva (opcional)</label>
              <select className="input-field" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                <option value="">—</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label style={{ marginTop: 14 }}>Observaciones (opcional)</label>
          <input className="input-field" value={loadNotes} onChange={(e) => setLoadNotes(e.target.value)} placeholder="Ej: muestras para taller nuevo" />

          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 16 }} onClick={() => void submitLoad()} disabled={saving}>
            <ArrowDownToLine size={14} /> Cargar a la camioneta
          </button>
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#666', fontSize: 14 }}>Cargando camioneta...</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>La camioneta está vacía.</p>
      ) : (
        <div className="card table-wrap" style={{ padding: 0, marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>En camioneta</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const isActing = acting?.code === i.code;
                return (
                  <tr key={i.code}>
                    <td style={{ fontFamily: 'monospace', color: '#888' }}>{i.code}</td>
                    <td style={{ color: '#fff' }}>{i.description}</td>
                    <td style={{ textAlign: 'right' }}><strong style={{ color: '#4ade80' }}>{i.quantity}</strong></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isActing ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#888', fontSize: 12 }}>{acting.kind === 'devolucion' ? 'Devolver' : 'Muestra'}</span>
                          <input
                            className="input-field"
                            style={{ width: 70, padding: '4px 8px' }}
                            inputMode="numeric"
                            autoFocus
                            placeholder="cant."
                            value={actQty}
                            onChange={(e) => setActQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void submitAct();
                              if (e.key === 'Escape') setActing(null);
                            }}
                          />
                          <input
                            className="input-field"
                            style={{ width: 150, padding: '4px 8px' }}
                            placeholder="obs. (opcional)"
                            value={actNotes}
                            onChange={(e) => setActNotes(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void submitAct();
                              if (e.key === 'Escape') setActing(null);
                            }}
                          />
                          <button className="btn-primary" style={{ padding: '4px 8px' }} onClick={() => void submitAct()} disabled={saving}><Check size={13} /></button>
                          <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setActing(null)} disabled={saving}><X size={13} /></button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startAct(i.code, 'muestra')}>
                            <PackageMinus size={13} /> Muestra
                          </button>
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startAct(i.code, 'devolucion')}>
                            <Undo2 size={13} /> Devolver
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {movements.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Movimientos</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {movements.map((m) => (
              <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10 }}>
                <span className={`badge ${KIND_BADGE[m.kind]}`}>{KIND_LABEL[m.kind]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13 }}>{m.quantity} × {m.description}</div>
                  <div style={{ color: '#666', fontSize: 11 }}>
                    {m.courierName ? `${m.courierName} · ` : ''}{m.staffName} · {fmtDate(m.createdAt)}
                  </div>
                  {m.notes && <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{m.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
