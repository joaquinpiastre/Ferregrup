import { useEffect, useState } from 'react';
import { Plus, FileText, Trash2, Printer, Download } from 'lucide-react';
import { createQuote, deleteQuote, fetchCatalog, subscribeQuotes } from '../api';
import { downloadSaleDocPdf, printSaleDoc } from '../printSaleDoc';
import ProductItemPicker from '../shared/ProductItemPicker';
import type { CatalogProduct, Quote, StreetOrderItem } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CotizacionesPanel({ token }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [clientName, setClientName] = useState('');
  const [items, setItems] = useState<StreetOrderItem[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeQuotes(token, setQuotes), [token]);
  useEffect(() => { fetchCatalog(token).then(setCatalog).catch(() => {}); }, [token]);

  function openAdd() {
    setClientName('');
    setItems([]);
    setNotes('');
    setError('');
    setShowForm(true);
  }

  async function submit() {
    if (items.length === 0) { setError('Agregá al menos un producto.'); return; }
    try {
      await createQuote(token, { clientName: clientName.trim() || undefined, notes: notes.trim() || undefined, items });
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cotización.');
    }
  }

  async function remove(q: Quote) {
    if (!confirm(`¿Eliminar la cotización de ${fmt(q.total)}?`)) return;
    await deleteQuote(token, q.id);
  }

  function printQuote(q: Quote) {
    printSaleDoc({
      title: 'Cotización',
      fileNameBase: `cotizacion-${q.id}`,
      clientName: q.clientName,
      staffName: q.staffName,
      items: q.items,
      total: q.total,
      notes: q.notes,
      footNote: 'Esta cotización no reserva stock ni tiene descuento asegurado — los precios pueden variar.',
      createdAt: q.createdAt,
    });
  }

  function downloadQuote(q: Quote) {
    void downloadSaleDocPdf({
      title: 'Cotización',
      fileNameBase: `cotizacion-${q.id}`,
      clientName: q.clientName,
      staffName: q.staffName,
      items: q.items,
      total: q.total,
      notes: q.notes,
      footNote: 'Esta cotización no reserva stock ni tiene descuento asegurado — los precios pueden variar.',
      createdAt: q.createdAt,
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Nueva cotización</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label>Cliente (opcional)</label>
          <input className="input-field" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre de quien pregunta, si lo tenés" style={{ marginBottom: 14 }} />

          <ProductItemPicker catalog={catalog} items={items} onItemsChange={setItems} />

          <label style={{ marginTop: 14 }}>Notas (opcional)</label>
          <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ej: válido por 7 días" />

          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={submit}>Guardar cotización</button>
          </div>
        </div>
      )}

      {quotes.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>Todavía no hay cotizaciones.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quotes.map((q) => (
            <div key={q.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
              <FileText size={16} color="#FFE000" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{q.clientName || 'Sin cliente'}</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {q.staffName} · {q.items.length} ítem{q.items.length !== 1 ? 's' : ''}{q.notes ? ` · ${q.notes}` : ''} · {fmtDate(q.createdAt)}
                </div>
              </div>
              <div style={{ color: '#FFE000', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{fmt(q.total)}</div>
              <button className="btn-secondary" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => printQuote(q)}><Printer size={13} /></button>
              <button className="btn-secondary" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => downloadQuote(q)}><Download size={13} /></button>
              <button className="btn-danger" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => remove(q)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
