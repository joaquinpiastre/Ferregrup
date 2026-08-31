import { useMemo, useState } from 'react';
import { Printer, Eye, StickyNote, PackageCheck, Truck, XCircle } from 'lucide-react';
import { printStreetOrder } from '../printTicket';
import { updateStreetOrderNotes, updateStreetOrderStatus } from '../api';
import type { Session, StreetOrder, StreetOrderStatus } from '../types';

interface Props {
  session: Session;
  orders: StreetOrder[];
  onOrderChanged: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const isFinal = (s: StreetOrderStatus) => s === 'retirado' || s === 'cancelado';

export default function PedidosCalleActivos({ session, orders, onOrderChanged }: Props) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const active = useMemo(
    () => orders.filter((o) => !isFinal(o.status)).sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  async function changeStatus(order: StreetOrder, status: StreetOrderStatus) {
    try {
      await updateStreetOrderStatus(session.token, order.id, status);
      onOrderChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    }
  }

  function startEditNote(order: StreetOrder) {
    setEditingNoteId(order.id);
    setNoteDraft(order.notes ?? '');
  }

  async function saveNote(order: StreetOrder) {
    setEditingNoteId(null);
    try {
      await updateStreetOrderNotes(session.token, order.id, noteDraft.trim());
      onOrderChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo guardar la nota.');
    }
  }

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Activos: {active.length} · Total en sistema: {orders.length}
      </p>

      {active.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>
          {orders.length === 0 ? 'Todavía no hay pedidos desde la calle.' : 'No hay pedidos activos. Los finalizados están en el Historial.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map((o) => (
            <div key={o.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{fmtDate(o.createdAt)}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="badge badge-green">{o.courierName}</span>
                  {o.clientName && <span className="badge badge-blue">{o.clientName}</span>}
                </div>
              </div>

              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginTop: 6 }}>{o.streetLabel}</div>
              <div style={{ marginTop: 2, fontSize: 13 }}>
                <span className="badge badge-yellow">{o.status}</span>
                <span style={{ color: '#888', marginLeft: 8 }}>Total {fmt(o.total)}</span>
              </div>

              {o.items.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2d2d2d', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {o.items.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      {it.code && <span className="badge badge-gray">{it.code}</span>}
                      <span style={{ flex: 1, color: '#ccc' }}>{it.quantity} × {it.description}</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{fmt(it.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              {o.nearbyClients.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2d2d2d' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#999', marginBottom: 4 }}>Clientes en la misma calle (ruta)</div>
                  {o.nearbyClients.map((c) => (
                    <div key={c.name + c.address} style={{ fontSize: 12, color: '#777' }}>· {c.name} — {c.address}</div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 10, border: '1px solid #2d2d2d', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Nota</div>
                {editingNoteId === o.id ? (
                  <div>
                    <textarea className="input-field" rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} autoFocus style={{ resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => saveNote(o)}>Guardar</button>
                      <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setEditingNoteId(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ cursor: 'pointer', color: o.notes ? '#ccc' : '#555', fontSize: 13, fontStyle: o.notes ? 'normal' : 'italic' }} onClick={() => startEditNote(o)}>
                    {o.notes || 'Toca para agregar...'}
                  </div>
                )}
              </div>

              <button className="btn-secondary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => printStreetOrder(o)}>
                <Printer size={14} /> Imprimir pedido
              </button>

              {!isFinal(o.status) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => changeStatus(o, 'visto')}><Eye size={12} /> Visto</button>
                  <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => changeStatus(o, 'nota')}><StickyNote size={12} /> Nota</button>
                  <button className="btn-primary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => changeStatus(o, 'armado')}><Truck size={12} /> Armado</button>
                  <button className="btn-primary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => changeStatus(o, 'retirado')}><PackageCheck size={12} /> Retirado</button>
                  <button className="btn-danger" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => changeStatus(o, 'cancelado')}><XCircle size={12} /> Cancelar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
