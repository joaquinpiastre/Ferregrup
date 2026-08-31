import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Package } from 'lucide-react';
import type { Product, ProductCategory, AppData } from '../types';
import { generateId } from '../store';

interface Props { data: AppData; onChange: (d: AppData) => void; }

const CATEGORIES: ProductCategory[] = ['Herramientas', 'Electricidad', 'Plomería', 'Pintura', 'Construcción', 'Fijaciones', 'Seguridad', 'Jardín', 'Otros'];
const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const emptyProduct = (): Omit<Product, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '', category: 'Herramientas', brand: '', sku: '', stock: 0, minStock: 0,
  costPrice: 0, salePrice: 0, unit: 'unidad', description: '',
});

export default function Inventario({ data, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const products = data.products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.brand.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  function openAdd() {
    setEditing(null);
    setForm(emptyProduct());
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, category: p.category, brand: p.brand, sku: p.sku, stock: p.stock, minStock: p.minStock, costPrice: p.costPrice, salePrice: p.salePrice, unit: p.unit, description: p.description });
    setShowModal(true);
  }

  function handleSave() {
    const now = new Date().toISOString().slice(0, 10);
    if (editing) {
      onChange({ ...data, products: data.products.map(p => p.id === editing.id ? { ...p, ...form, updatedAt: now } : p) });
    } else {
      const newP: Product = { ...form, id: generateId(), createdAt: now, updatedAt: now };
      onChange({ ...data, products: [...data.products, newP] });
    }
    setShowModal(false);
  }

  function handleDelete(id: string) {
    onChange({ ...data, products: data.products.filter(p => p.id !== id) });
    setDeleteConfirm(null);
  }

  const stockValue = data.products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const saleValue = data.products.reduce((s, p) => s + p.stock * p.salePrice, 0);
  const lowCount = data.products.filter(p => p.stock <= p.minStock).length;

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Inventario</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{data.products.length} productos registrados</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Nuevo Producto</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <MiniStat label="Valor de costo" value={fmt(stockValue)} color="#FFE000" />
        <MiniStat label="Valor de venta" value={fmt(saleValue)} color="#4ade80" />
        <MiniStat label="Stock bajo" value={`${lowCount} productos`} color="#fb923c" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por nombre, SKU o marca..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>SKU</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
              <th style={{ textAlign: 'right' }}>Costo</th>
              <th style={{ textAlign: 'right' }}>Venta</th>
              <th style={{ textAlign: 'right' }}>Valor total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#555', padding: 40 }}>
                <Package size={32} color="#333" style={{ margin: '0 auto 8px', display: 'block' }} />
                No se encontraron productos
              </td></tr>
            )}
            {products.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 500, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{p.brand} · {p.unit}</div>
                </td>
                <td><span className="badge badge-gray">{p.category}</span></td>
                <td style={{ color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{p.sku}</td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: p.stock === 0 ? '#f87171' : p.stock <= p.minStock ? '#fb923c' : '#4ade80' }}>
                    {p.stock}
                  </span>
                  {p.stock <= p.minStock && <AlertTriangle size={12} color="#fb923c" style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                </td>
                <td style={{ textAlign: 'right', color: '#aaa' }}>{fmt(p.costPrice)}</td>
                <td style={{ textAlign: 'right', color: '#FFE000', fontWeight: 600 }}>{fmt(p.salePrice)}</td>
                <td style={{ textAlign: 'right', color: '#fff' }}>{fmt(p.stock * p.salePrice)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-secondary" style={{ padding: '5px 8px' }} onClick={() => openEdit(p)}><Edit2 size={14} /></button>
                    <button className="btn-danger" style={{ padding: '5px 8px' }} onClick={() => setDeleteConfirm(p.id)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', marginBottom: 20, fontSize: 18 }}>{editing ? 'Editar Producto' : 'Nuevo Producto'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Nombre del producto *</label>
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Taladro percutor 13mm" />
              </div>
              <div>
                <label>Categoría</label>
                <select className="input-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ProductCategory })}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Marca</label>
                <input className="input-field" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="Bosch, Stanley..." />
              </div>
              <div>
                <label>SKU / Código</label>
                <input className="input-field" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="TAL-001" />
              </div>
              <div>
                <label>Unidad</label>
                <select className="input-field" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  {['unidad', 'caja', 'rollo', 'litro', 'kg', 'metro', 'bolsa'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label>Stock actual</label>
                <input className="input-field" type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
              </div>
              <div>
                <label>Stock mínimo</label>
                <input className="input-field" type="number" min={0} value={form.minStock} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} />
              </div>
              <div>
                <label>Precio de costo ($)</label>
                <input className="input-field" type="number" min={0} value={form.costPrice} onChange={e => setForm({ ...form, costPrice: Number(e.target.value) })} />
              </div>
              <div>
                <label>Precio de venta ($)</label>
                <input className="input-field" type="number" min={0} value={form.salePrice} onChange={e => setForm({ ...form, salePrice: Number(e.target.value) })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Descripción</label>
                <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción opcional..." style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.name}>{editing ? 'Guardar cambios' : 'Agregar producto'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 380, textAlign: 'center' }}>
            <Trash2 size={40} color="#f87171" style={{ margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ color: '#fff', marginBottom: 8 }}>¿Eliminar producto?</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteConfirm)}>Eliminar</button>
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
