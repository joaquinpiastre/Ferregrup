import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, Upload, CheckCircle2 } from 'lucide-react';
import { confirmCatalogImport, deleteCatalogProduct, fetchCatalog, previewCatalogImport, upsertCatalogProduct } from '../api';
import type { CatalogImportPreview } from '../api';
import type { CatalogProduct } from '../types';

interface Props {
  token: string;
  canEdit: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const emptyForm = () => ({ code: '', description: '', unitPrice: '', stock: '0', costPrice: '', ivaRate: '21' });
const PREVIEW_LIMIT = 25;
const IVA_OPTIONS = [
  { value: '0', label: 'Exento (0%)' },
  { value: '10.5', label: '10,5%' },
  { value: '21', label: '21%' },
  { value: '27', label: '27%' },
];

export default function CatalogoPanel({ token, canEdit }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [importedMsg, setImportedMsg] = useState('');

  function refresh() {
    fetchCatalog(token).then(setProducts).catch(() => {});
  }

  useEffect(refresh, [token]);

  const ROW_LIMIT = 200;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [products, search]);
  const filtered = matches.slice(0, ROW_LIMIT);

  async function save() {
    const price = Number(form.unitPrice.replace(',', '.'));
    const stock = parseInt(form.stock, 10);
    const ivaRate = Number(form.ivaRate);
    const costPrice = form.costPrice.trim() ? Number(form.costPrice.replace(',', '.')) : undefined;
    if (!form.code.trim() || !form.description.trim() || !Number.isFinite(price) || price < 0) {
      setError('Completá código, descripción y un precio válido.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setError('Ingresá un stock válido.');
      return;
    }
    if (costPrice !== undefined && (!Number.isFinite(costPrice) || costPrice < 0)) {
      setError('Ingresá un costo válido.');
      return;
    }
    try {
      await upsertCatalogProduct(token, {
        code: form.code.trim(),
        description: form.description.trim(),
        unitPrice: price,
        stock,
        costPrice,
        ivaRate,
      });
      setShowForm(false);
      setForm(emptyForm());
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  function openEdit(p: CatalogProduct) {
    setForm({
      code: p.code,
      description: p.description,
      unitPrice: String(p.unitPrice),
      stock: String(p.stock),
      costPrice: p.costPrice !== undefined ? String(p.costPrice) : '',
      ivaRate: String(p.ivaRate),
    });
    setError('');
    setShowForm(true);
  }

  async function remove(p: CatalogProduct) {
    if (!confirm(`¿Eliminar ${p.description}?`)) return;
    await deleteCatalogProduct(token, p.code);
    refresh();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    setImportedMsg('');
    setImporting(true);
    try {
      const result = await previewCatalogImport(token, file);
      setPreview(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setConfirming(true);
    setImportError('');
    try {
      const result = await confirmCatalogImport(token, preview.rows);
      setPreview(null);
      setImportedMsg(`Catálogo actualizado: ${result.imported} productos.`);
      refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo actualizar el catálogo.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileSelected} />
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <Upload size={14} /> {importing ? 'Leyendo...' : 'Importar Excel'}
            </button>
            <button className="btn-primary" onClick={() => { setShowForm(true); setForm(emptyForm()); setError(''); }}><Plus size={14} /> Nuevo</button>
          </>
        )}
      </div>

      {importError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 14 }}>{importError}</div>}
      {importedMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontSize: 13, marginBottom: 14 }}>
          <CheckCircle2 size={15} /> {importedMsg}
        </div>
      )}

      {preview && (
        <div className="modal-overlay" onClick={() => !confirming && setPreview(null)}>
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 6, fontSize: 17 }}>Importar catálogo desde Excel</h2>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
              {preview.fileName} — {preview.total} producto{preview.total !== 1 ? 's' : ''} encontrado{preview.total !== 1 ? 's' : ''}
              {preview.skipped > 0 ? `, ${preview.skipped} fila${preview.skipped !== 1 ? 's' : ''} omitida${preview.skipped !== 1 ? 's' : ''} por datos incompletos` : ''}.
              {' '}Esto va a <strong>reemplazar</strong> el catálogo actual: los productos que no estén en el archivo quedan inactivos. El stock, costo e IVA cargados a mano no se pierden.
            </p>

            <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #2d2d2d', borderRadius: 10 }}>
              <table>
                <thead>
                  <tr><th>Código</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Precio</th></tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, PREVIEW_LIMIT).map((p) => (
                    <tr key={p.code}>
                      <td style={{ fontFamily: 'monospace', color: '#888' }}>{p.code}</td>
                      <td style={{ color: '#fff' }}>{p.description}</td>
                      <td style={{ textAlign: 'right', color: '#FFE000', fontWeight: 600 }}>{fmt(p.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.total > PREVIEW_LIMIT && (
                <div style={{ padding: '10px 14px', color: '#666', fontSize: 12 }}>
                  ...y {preview.total - PREVIEW_LIMIT} más.
                </div>
              )}
            </div>

            {importError && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{importError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button className="btn-secondary" onClick={() => setPreview(null)} disabled={confirming}>Cancelar</button>
              <button className="btn-primary" onClick={confirmImport} disabled={confirming}>
                {confirming ? 'Actualizando...' : 'Confirmar y actualizar catálogo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && canEdit && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
            <div>
              <label>Código</label>
              <input className="input-field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label>Descripción</label>
              <input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label>Precio de venta</label>
              <input className="input-field" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
            </div>
            <div>
              <label>Stock</label>
              <input className="input-field" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div>
              <label>Costo (opcional)</label>
              <input className="input-field" inputMode="decimal" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </div>
            <div>
              <label>IVA</label>
              <select className="input-field" value={form.ivaRate} onChange={(e) => setForm({ ...form, ivaRate: e.target.value })}>
                {IVA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>Guardar</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay productos que coincidan.</p>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Precio</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>IVA</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Costo</th>}
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.code} onClick={() => canEdit && openEdit(p)} style={canEdit ? { cursor: 'pointer' } : undefined}>
                  <td style={{ fontFamily: 'monospace', color: '#888' }}>{p.code}</td>
                  <td style={{ color: '#fff' }}>{p.description}</td>
                  <td style={{ textAlign: 'right', color: '#FFE000', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(p.unitPrice)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.stock <= 0 ? <span className="badge badge-red">Sin stock</span> : p.stock}
                  </td>
                  <td style={{ textAlign: 'right', color: '#999', whiteSpace: 'nowrap' }}>{p.ivaRate === 0 ? 'Exento' : `${p.ivaRate}%`}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right', color: '#999', whiteSpace: 'nowrap' }}>
                      {p.costPrice !== undefined ? fmt(p.costPrice) : '—'}
                    </td>
                  )}
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); remove(p); }}><Trash2 size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {matches.length > filtered.length && (
            <div style={{ padding: '10px 14px', color: '#666', fontSize: 12, borderTop: '1px solid #2d2d2d' }}>
              Mostrando {filtered.length} de {matches.length} — refiná la búsqueda para ver más.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
