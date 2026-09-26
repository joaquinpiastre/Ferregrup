import { useEffect, useMemo, useState } from 'react';
import { Boxes, Check, PackagePlus, Pencil, Search, X } from 'lucide-react';
import { adjustStock, fetchCatalog } from '../api';
import type { CatalogProduct } from '../types';

interface Props {
  token: string;
}

type Filter = 'todos' | 'sin' | 'con';
type EditMode = 'add' | 'set';

const ROW_LIMIT = 200;

export default function StockPanel({ token }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [editing, setEditing] = useState<{ code: string; mode: EditMode } | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCatalog(token).then((p) => { setProducts(p); setLoading(false); }).catch(() => setLoading(false));
  }, [token]);

  const sinStock = useMemo(() => products.filter((p) => p.stock <= 0).length, [products]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => filter === 'todos' || (filter === 'sin' ? p.stock <= 0 : p.stock > 0))
      .filter((p) => !q || p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [products, search, filter]);
  const visible = matches.slice(0, ROW_LIMIT);

  function startEdit(code: string, mode: EditMode) {
    setEditing({ code, mode });
    setValue('');
    setError('');
  }

  function cancelEdit() {
    setEditing(null);
    setError('');
  }

  async function confirmEdit() {
    if (!editing || saving) return;
    const quantity = parseInt(value, 10);
    if (!Number.isFinite(quantity)) {
      setError('Ingresá un número entero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await adjustStock(token, editing.code, { mode: editing.mode, quantity });
      setProducts((prev) => prev.map((p) => (p.code === editing.code ? { ...p, stock: result.stock } : p)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el stock.');
    } finally {
      setSaving(false);
    }
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'todos', label: `Todos (${products.length})` },
    { id: 'sin', label: `Sin stock (${sinStock})` },
    { id: 'con', label: `Con stock (${products.length - sinStock})` },
  ];

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Boxes size={22} color="#FFE000" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{products.length - sinStock} de {products.length}</div>
          <div style={{ fontSize: 12, color: '#888' }}>productos con stock · {sinStock} sin stock</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar producto por código o descripción..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#666', fontSize: 14 }}>Cargando stock...</p>
      ) : visible.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay productos que coincidan.</p>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>Ajustar</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const isEditing = editing?.code === p.code;
                return (
                  <tr key={p.code}>
                    <td style={{ fontFamily: 'monospace', color: '#888' }}>{p.code}</td>
                    <td style={{ color: '#fff' }}>{p.description}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.stock <= 0 ? <span className="badge badge-red">{p.stock < 0 ? `Sin stock (${p.stock})` : 'Sin stock'}</span> : <strong style={{ color: '#4ade80' }}>{p.stock}</strong>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <input
                            className="input-field"
                            style={{ width: 90, padding: '4px 8px' }}
                            inputMode="numeric"
                            autoFocus
                            placeholder={editing.mode === 'add' ? '+ / -' : 'nuevo stock'}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void confirmEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                          <button className="btn-primary" style={{ padding: '4px 8px' }} onClick={() => void confirmEdit()} disabled={saving}><Check size={13} /></button>
                          <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={cancelEdit} disabled={saving}><X size={13} /></button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startEdit(p.code, 'add')}>
                            <PackagePlus size={13} /> Ingreso
                          </button>
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startEdit(p.code, 'set')}>
                            <Pencil size={13} /> Corregir
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {matches.length > visible.length && (
            <div style={{ padding: '10px 14px', color: '#666', fontSize: 12, borderTop: '1px solid #2d2d2d' }}>
              Mostrando {visible.length} de {matches.length} — refiná la búsqueda para ver más.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
