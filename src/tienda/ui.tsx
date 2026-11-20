import { useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, ShoppingCart } from 'lucide-react';
import { Link } from './router';
import { useCart } from './cart';
import { useStore } from './context';
import { cuota, money, money2, type StoreProduct } from './data';

export function SectionHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="tn-sec-head">
      <div>
        {eyebrow && <div className="tn-eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, small }: { value: number; onChange: (n: number) => void; min?: number; small?: boolean }) {
  return (
    <div className={`tn-stepper${small ? ' sm' : ''}`}>
      <button type="button" aria-label="Restar uno" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        <Minus size={small ? 13 : 15} />
      </button>
      <span>{value}</span>
      <button type="button" aria-label="Sumar uno" onClick={() => onChange(Math.min(99, value + 1))}>
        <Plus size={small ? 13 : 15} />
      </button>
    </div>
  );
}

export function ProductImage({ product, size = 'card' }: { product: StoreProduct; size?: 'card' | 'big' | 'thumb' }) {
  const [failed, setFailed] = useState(false);
  if (!product.image || failed) {
    return <div className={`tn-noimg ${size}`}>{(product.brand ?? 'El Maná').slice(0, 14)}</div>;
  }
  return (
    <img
      src={product.image}
      alt={product.name}
      loading={size === 'big' ? 'eager' : 'lazy'}
      decoding="async"
      width={size === 'thumb' ? 64 : 400}
      height={size === 'thumb' ? 64 : 400}
      onError={() => setFailed(true)}
    />
  );
}

export function ProductCard({ product }: { product: StoreProduct }) {
  const { catalog } = useStore();
  const { add, setOpen } = useCart();
  const [added, setAdded] = useState(false);
  const n = catalog?.settings.cuotas ?? 3;
  const transfer = catalog?.settings.transferPct ?? 0;
  const href = `/producto/${product.slug}`;

  function addToCart() {
    add(product.code, 1);
    setAdded(true);
    setOpen(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="tn-card">
      <Link to={href} className="tn-card-img" aria-label={product.name}>
        <ProductImage product={product} />
        {product.offerPct ? <span className="tn-off">-{Math.round(product.offerPct)}%</span> : null}
      </Link>
      <div className="tn-card-body">
        {product.brand && <div className="tn-card-brand">{product.brand}</div>}
        <Link to={href} className="tn-card-name" title={product.name}>
          {product.name}
        </Link>
        <div className="tn-card-bottom">
          <div className="tn-card-prices">
            {product.listPrice ? <span className="tn-old">{money(product.listPrice)}</span> : null}
            <span className="tn-price">{money(product.price)}</span>
          </div>
          {n > 1 && (
            <div className="tn-cuotas">
              <b>{n} cuotas sin interés</b> de {money2(cuota(product.price, n))}
            </div>
          )}
          {transfer > 0 && <div className="tn-transfer">{money(Math.round(product.price * (1 - transfer / 100)))} con transferencia</div>}
          <button type="button" className={`tn-add${added ? ' done' : ''}`} onClick={addToCart}>
            {added ? <Check size={16} /> : <ShoppingCart size={16} />} {added ? 'Agregado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductRail({ products }: { products: StoreProduct[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 260), behavior: 'smooth' });
  };
  return (
    <div className="tn-rail">
      <button type="button" className="tn-rail-btn left" aria-label="Anteriores" onClick={() => scroll(-1)}>
        <ChevronLeft size={20} />
      </button>
      <div className="tn-rail-track" ref={ref}>
        {products.map((p) => (
          <div className="tn-rail-item" key={p.code}>
            <ProductCard product={p} />
          </div>
        ))}
      </div>
      <button type="button" className="tn-rail-btn right" aria-label="Siguientes" onClick={() => scroll(1)}>
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

export function ProductGrid({ products }: { products: StoreProduct[] }) {
  return (
    <div className="tn-grid">
      {products.map((p) => (
        <ProductCard key={p.code} product={p} />
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div className="tn-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="tn-card tn-skeleton">
          <div className="tn-card-img" />
          <div className="tn-card-body">
            <div className="sk-line w40" />
            <div className="sk-line" />
            <div className="sk-line w70" />
          </div>
        </div>
      ))}
    </div>
  );
}
