import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { deleteCatalogProduct, fetchCatalog, upsertCatalogProduct } from '../api';
import type { CatalogProduct } from '../types';

interface Props {
  token: string;
  canEdit: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const emptyForm = () => ({ code: '', description: '', unitPrice: '' });

export default function CatalogoPanel({ token, canEdit }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');

  function refresh() {
    fetchCatalog(token).then(setProducts).catch(() => {});
  }

  useEffect(refresh, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [products, search]);

  async function save() {
    const price = Number(form.unitPrice.replace(',', '.'));
    if (!form.code.trim() || !form.description.trim() || !Number.isFinite(price) || price < 0) {
      setError('Completá código, descripción y un precio válido.');
      return;
    }
    try {
      await upsertCatalogProduct(token, { code: form.code.trim(), description: form.description.trim(), unitPrice: price });
      setShowForm(false);
      setForm(emptyForm());
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  async function remove(p: CatalogProduct) {
    if (!confirm(`¿Eliminar ${p.description}?`)) return;
    await deleteCatalogProduct(token, p.code);
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canEdit && <button className="btn-primary" onClick={() => { setShowForm(true); setError(''); }}><Plus size={14} /> Nuevo</button>}
      </div>

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
              <label>Precio</label>
              <input className="input-field" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr><th>Código</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Precio</th>{canEdit && <th></th>}</tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.code}>
                  <td style={{ fontFamily: 'monospace', color: '#888' }}>{p.code}</td>
                  <td style={{ color: '#fff' }}>{p.description}</td>
                  <td style={{ textAlign: 'right', color: '#FFE000', fontWeight: 600 }}>{fmt(p.unitPrice)}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => remove(p)}><Trash2 size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
