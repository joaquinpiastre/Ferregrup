import { useEffect } from 'react';
import { ShoppingCart, Trash2, X } from 'lucide-react';
import { Link, navigate } from './router';
import { useCart } from './cart';
import { useStore } from './context';
import { cuota, money, money2 } from './data';
import { ProductImage, Stepper } from './ui';

export default function CartDrawer() {
  const { lines, open, setOpen, setQty, remove } = useCart();
  const { byCode, catalog } = useStore();
  const n = catalog?.settings.cuotas ?? 3;
  const items = lines.map((l) => ({ ...l, p: byCode.get(l.code) })).filter((x) => x.p);
  const total = items.reduce((s, x) => s + x.p!.price * x.qty, 0);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="tn-drawer-bg" onClick={() => setOpen(false)}>
      <aside className="tn-drawer right" onClick={(e) => e.stopPropagation()} aria-label="Carrito">
        <div className="tn-drawer-head">
          <strong>
            <ShoppingCart size={18} /> Tu carrito
          </strong>
          <button type="button" className="tn-icon-btn" aria-label="Cerrar carrito" onClick={() => setOpen(false)}>
            <X size={22} />
          </button>
        </div>
        {items.length === 0 ? (
          <div className="tn-drawer-empty">
            <ShoppingCart size={40} />
            <p>Tu carrito está vacío.</p>
            <button type="button" className="tn-btn primary" onClick={() => setOpen(false)}>
              Ver productos
            </button>
          </div>
        ) : (
          <>
            <div className="tn-drawer-body">
              {items.map(({ code, qty, p }) => (
                <div className="tn-line" key={code}>
                  <Link to={`/producto/${p!.slug}`} className="tn-line-img" onClick={() => setOpen(false)}>
                    <ProductImage product={p!} size="thumb" />
                  </Link>
                  <div className="tn-line-info">
                    <Link to={`/producto/${p!.slug}`} className="tn-line-name" onClick={() => setOpen(false)}>
                      {p!.name}
                    </Link>
                    <div className="tn-line-row">
                      <Stepper small value={qty} onChange={(v) => setQty(code, v)} />
                      <b>{money(p!.price * qty)}</b>
                    </div>
                  </div>
                  <button type="button" className="tn-line-del" aria-label="Quitar" onClick={() => remove(code)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="tn-drawer-foot">
              <div className="tn-sum-row">
                <span>Total</span>
                <b>{money(total)}</b>
              </div>
              {n > 1 && (
                <div className="tn-cuotas center">
                  <b>{n} cuotas sin interés</b> de {money2(cuota(total, n))}
                </div>
              )}
              <button
                type="button"
                className="tn-btn primary block lg"
                onClick={() => {
                  setOpen(false);
                  navigate('/checkout');
                }}
              >
                Iniciar compra
              </button>
              <button type="button" className="tn-btn ghost block" onClick={() => setOpen(false)}>
                Seguir comprando
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
