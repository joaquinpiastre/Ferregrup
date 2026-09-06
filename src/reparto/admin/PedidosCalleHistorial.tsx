import { useMemo, useState } from 'react';
import { Search, Printer, Download } from 'lucide-react';
import { downloadStreetOrderPdf, printStreetOrder } from '../printTicket';
import type { StreetOrder } from '../types';

interface Props {
  orders: StreetOrder[];
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PedidosCalleHistorial({ orders }: Props) {
  const [search, setSearch] = useState('');

  const finished = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => o.status === 'retirado' || o.status === 'cancelado')
      .filter((o) => !q || o.streetLabel.toLowerCase().includes(q) || o.courierName.toLowerCase().includes(q) || (o.clientName ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, search]);

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por calle, repartidor o cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {finished.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay pedidos finalizados todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {finished.map((o) => (
            <div key={o.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{o.streetLabel}</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>{fmtDate(o.createdAt)} · {o.courierName}{o.clientName ? ` · ${o.clientName}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={o.status === 'retirado' ? 'badge badge-green' : 'badge badge-red'}>{o.status}</span>
                  <div style={{ color: '#fff', fontWeight: 600, marginTop: 4 }}>{fmt(o.total)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center', padding: '4px 10px', fontSize: 12 }} onClick={() => printStreetOrder(o)}>
                  <Printer size={12} /> Imprimir
                </button>
                <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center', padding: '4px 10px', fontSize: 12 }} onClick={() => downloadStreetOrderPdf(o)}>
                  <Download size={12} /> Descargar PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
