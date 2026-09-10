import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CatalogProduct, StreetOrderItem } from '../types';

interface Props {
  catalog: CatalogProduct[];
  items: StreetOrderItem[];
  onItemsChange: (items: StreetOrderItem[]) => void;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function ProductItemPicker({ catalog, items, onItemsChange }: Props) {
  const [productQuery, setProductQuery] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [error, setError] = useState('');

  const catalogByCode = useMemo(() => new Map(catalog.map((p) => [p.code, p])), [catalog]);

  const productSuggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog.filter((p) => p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 6);
  }, [productQuery, catalog]);

  function pickProduct(p: CatalogProduct) {
    setProductQuery(p.description);
    setUnitPrice(String(p.unitPrice));
    setSelectedCode(p.code);
  }

  function addItem() {
    const description = productQuery.trim();
    const price = Number(unitPrice.replace(',', '.'));
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    if (!description) {
      setError('Escribí qué producto es.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Ingresá un precio unitario válido.');
      return;
    }
    setError('');
    onItemsChange([
      ...items,
      { code: selectedCode, description, quantity: qty, unitPrice: price, subtotal: Math.round(price * qty * 100) / 100 },
    ]);
    setProductQuery('');
    setUnitPrice('');
    setQuantity('1');
    setSelectedCode(undefined);
  }

  function removeItem(idx: number) {
    onItemsChange(items.filter((_, i) => i !== idx));
  }

  const total = items.reduce((sum, it) => sum + it.subtotal, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Agregar producto
        </div>
        <label>Producto</label>
        <div style={{ position: 'relative' }}>
          <input
            className="input-field"
            placeholder="Buscar en el catálogo o escribir manualmente..."
            value={productQuery}
            onChange={(e) => { setProductQuery(e.target.value); setSelectedCode(undefined); }}
          />
          {productSuggestions.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}>
              {productSuggestions.map((p) => (
                <div
                  key={p.code}
                  onClick={() => pickProduct(p)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2d2d2d')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: '#fff', fontSize: 13, flex: 1, minWidth: 0 }}>{p.description}</span>
                  {p.stock <= 0 ? (
                    <span className="badge badge-red" style={{ flexShrink: 0 }}>Sin stock</span>
                  ) : (
                    <span className="badge badge-green" style={{ flexShrink: 0 }}>Stock: {p.stock}</span>
                  )}
                  <span style={{ color: '#FFE000', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{fmt(p.unitPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label>Precio unitario</label>
            <input className="input-field" inputMode="decimal" placeholder="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <label>Cantidad</label>
            <input className="input-field" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        {selectedCode && catalogByCode.get(selectedCode) && catalogByCode.get(selectedCode)!.stock <= 0 && (
          <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>
            ⚠ Este producto no tiene stock cargado — se puede agregar igual, pero quedará en negativo.
          </div>
        )}
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <button className="btn-secondary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={addItem}>
          <Plus size={14} /> Agregar
        </button>
      </div>

      {items.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ítems
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((it, i) => {
              const product = it.code ? catalogByCode.get(it.code) : undefined;
              const lowStock = product && product.stock < it.quantity;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#fff', minWidth: 0 }}>
                    {it.quantity} × {it.description}
                    {lowStock && <span className="badge badge-red" style={{ marginLeft: 8 }}>Sin stock suficiente</span>}
                  </span>
                  <span style={{ color: '#FFE000', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{fmt(it.subtotal)}</span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2, flexShrink: 0 }} onClick={() => removeItem(i)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'right', marginTop: 10, fontSize: 16, fontWeight: 700, color: '#FFE000' }}>Total: {fmt(total)}</div>
        </div>
      )}
    </div>
  );
}
