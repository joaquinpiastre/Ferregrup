import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BadgeCheck, Check, ChevronRight, CreditCard, MessageCircle, ShoppingCart, Store, Truck } from 'lucide-react';
import { Link, navigate } from '../router';
import { useCart } from '../cart';
import { useStore } from '../context';
import { categoryColor, cuota, money, money2, whatsappLink, withoutTaxes } from '../data';
import { ProductImage, ProductRail, SectionHead, Stepper } from '../ui';
import NotFound from './NotFound';

export default function ProductPage({ slug }: { slug: string }) {
  const { catalog, bySlug, categoryName, error } = useStore();
  const { add, setOpen } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const product = bySlug.get(slug);
  const n = catalog?.settings.cuotas ?? 3;
  const transfer = catalog?.settings.transferPct ?? 0;

  useEffect(() => {
    if (product) document.title = `${product.name} · El Maná Distribuidora`;
  }, [product]);

  const related = useMemo(() => {
    if (!product || !catalog) return [];
    const same = catalog.products.filter((p) => p.code !== product.code && p.category === product.category);
    const near = same.sort((a, b) => Math.abs(a.price - product.price) - Math.abs(b.price - product.price));
    return near.slice(0, 12);
  }, [product, catalog]);

  if (error) {
    return (
      <div className="tn-wrap tn-page">
        <div className="tn-alert">{error}</div>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="tn-wrap tn-page">
        <div className="tn-pdp tn-skeleton" style={{ minHeight: 460 }} />
      </div>
    );
  }
  if (!product) return <NotFound />;

  const wa = whatsappLink(catalog.settings.whatsapp, `Hola El Maná! Quería consultar por: ${product.name} (cód. ${product.code}).`);

  function addToCart(buyNow = false) {
    add(product!.code, qty);
    if (buyNow) {
      navigate('/checkout');
      return;
    }
    setAdded(true);
    setOpen(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <>
      <div className="tn-wrap tn-page tn-page-pdp" style={{ '--c': categoryColor(product.category) } as CSSProperties}>
        <nav className="tn-crumbs" aria-label="Estás en">
          <Link to="/">Inicio</Link>
          <ChevronRight size={14} />
          {product.category && (
            <>
              <Link to={`/categoria/${product.category}`}>{categoryName(product.category)}</Link>
              <ChevronRight size={14} />
            </>
          )}
          <span>{product.name}</span>
        </nav>

        <div className="tn-pdp">
          <div className="tn-pdp-img">
            <ProductImage product={product} size="big" />
            {product.offerPct ? <span className="tn-off big">-{Math.round(product.offerPct)}%</span> : null}
          </div>

          <div className="tn-pdp-info">
            {product.brand && <div className="tn-pdp-brand">{product.brand}</div>}
            <h1>{product.name}</h1>
            <div className="tn-pdp-code">Cód. {product.code}</div>

            <div className="tn-pdp-price">
              {product.listPrice ? (
                <div className="tn-pdp-old">
                  <s>{money(product.listPrice)}</s>
                  <span className="tn-off-tag">{Math.round(product.offerPct ?? 0)}% OFF</span>
                </div>
              ) : null}
              <div className="tn-pdp-now">{money(product.price)}</div>
              <div className="tn-pdp-tax">Precio sin impuestos nacionales: {money2(withoutTaxes(product.price, product.iva))}</div>
            </div>

            {n > 1 && (
              <div className="tn-pdp-cuotas">
                <CreditCard size={20} />
                <div>
                  <b>
                    {n} cuotas sin interés de {money2(cuota(product.price, n))}
                  </b>
                  <span>
                    Total {money(product.price)} · CFT 0,00% · TEA 0,00%
                  </span>
                </div>
              </div>
            )}
            {transfer > 0 && (
              <div className="tn-pdp-transfer">
                <b>{money(Math.round(product.price * (1 - transfer / 100)))}</b> pagando por transferencia ({transfer}% de descuento)
              </div>
            )}

            <div className="tn-pdp-buy">
              <Stepper value={qty} onChange={setQty} />
              <button type="button" className={`tn-btn primary lg grow${added ? ' done' : ''}`} onClick={() => addToCart()}>
                {added ? <Check size={18} /> : <ShoppingCart size={18} />} {added ? 'Agregado al carrito' : 'Agregar al carrito'}
              </button>
            </div>
            <button type="button" className="tn-btn dark block lg" onClick={() => addToCart(true)}>
              Comprar ahora
            </button>
            <a className="tn-btn wa-outline block" href={wa} target="_blank" rel="noreferrer">
              <MessageCircle size={18} /> Consultar por WhatsApp
            </a>

            <ul className="tn-pdp-perks">
              <li className="k1">
                <Truck size={18} />
                <span>
                  <b>Envío a domicilio</b> en San Rafael y alrededores. Coordinamos el día por WhatsApp.
                </span>
              </li>
              <li className="k2">
                <Store size={18} />
                <span>
                  <b>Retiro sin cargo</b> en Av. Granaderos 575, San Rafael.
                </span>
              </li>
              <li className="k3">
                <BadgeCheck size={18} />
                <span>
                  <b>Producto original</b> con garantía oficial {product.brand ? `de ${product.brand}` : 'del fabricante'}.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="tn-band tn-band-cream tn-related">
          <div className="tn-wrap">
            <SectionHead eyebrow="También te puede interesar" title={`Más en ${categoryName(product.category)}`} />
            <ProductRail products={related} />
          </div>
        </section>
      )}

      <div className="tn-buybar tn-only-mobile">
        <div>
          <b>{money(product.price)}</b>
          {n > 1 && (
            <small>
              {n} x {money2(cuota(product.price, n))} sin interés
            </small>
          )}
        </div>
        <button type="button" className="tn-btn primary" onClick={() => addToCart()}>
          <ShoppingCart size={17} /> Agregar
        </button>
      </div>
    </>
  );
}
