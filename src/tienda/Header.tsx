import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, LayoutGrid, LogIn, Menu, MessageCircle, Search, ShoppingCart, Tag, X } from 'lucide-react';
import { Link, navigate } from './router';
import { useCart } from './cart';
import { useStore } from './context';
import { CATEGORY_ICON, categoryColor, money, searchProducts, whatsappLink } from './data';
import { ProductImage } from './ui';

const QUICK = [
  { slug: 'herramientas-electricas', label: 'Eléctricas' },
  { slug: 'herramientas-a-bateria', label: 'A batería' },
  { slug: 'herramientas-de-mano', label: 'De mano' },
  { slug: 'jardin-y-poda', label: 'Jardín' },
  { slug: 'construccion-y-obra', label: 'Obra' },
  { slug: 'pinturas', label: 'Pinturas' },
];

function PromoBar() {
  const { catalog } = useStore();
  const n = catalog?.settings.cuotas ?? 3;
  const transfer = catalog?.settings.transferPct ?? 0;
  const messages = useMemo(
    () => [
      `Hasta ${n} cuotas sin interés en toda la tienda`,
      'Envío a domicilio en San Rafael y alrededores',
      ...(transfer > 0 ? [`${transfer}% de descuento pagando por transferencia`] : []),
      'Retiro sin cargo en Av. Granaderos 575',
      'Atención personalizada por WhatsApp',
    ],
    [n, transfer]
  );
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => (x + 1) % messages.length), 4200);
    return () => window.clearInterval(t);
  }, [messages.length]);
  return (
    <div className="tn-promo" role="note">
      <div className="tn-wrap">
        <span key={i} className="tn-promo-msg">
          {messages[i % messages.length]}
        </span>
      </div>
    </div>
  );
}

function SearchBox({ onDone }: { onDone?: () => void }) {
  const { catalog } = useStore();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const results = useMemo(() => (q.trim().length >= 2 && catalog ? searchProducts(catalog.products, q).slice(0, 6) : []), [q, catalog]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setFocus(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setFocus(false);
    onDone?.();
    navigate(`/productos?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form className="tn-search" ref={box} onSubmit={submit} role="search">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        placeholder="¿Qué estás buscando? Taladro, amoladora, látex…"
        aria-label="Buscar productos"
      />
      <button type="submit" aria-label="Buscar">
        <Search size={18} />
      </button>
      {focus && results.length > 0 && (
        <div className="tn-suggest">
          {results.map((p) => (
            <Link
              key={p.code}
              to={`/producto/${p.slug}`}
              className="tn-suggest-item"
              onClick={() => {
                setFocus(false);
                setQ('');
                onDone?.();
              }}
            >
              <span className="thumb">
                <ProductImage product={p} size="thumb" />
              </span>
              <span className="name">{p.name}</span>
              <span className="price">{money(p.price)}</span>
            </Link>
          ))}
          <button type="submit" className="tn-suggest-all">
            Ver todos los resultados de “{q.trim()}”
          </button>
        </div>
      )}
    </form>
  );
}

export default function Header() {
  const { catalog } = useStore();
  const { count, setOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const [mega, setMega] = useState(false);
  const wa = whatsappLink(catalog?.settings.whatsapp ?? '5492604696700', 'Hola El Maná! Quería hacer una consulta.');
  const categories = catalog?.categories ?? [];

  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menu]);

  return (
    <>
      <PromoBar />
      <header className="tn-header">
        <div className="tn-wrap tn-header-in">
          <button type="button" className="tn-icon-btn tn-only-mobile" aria-label="Abrir menú" onClick={() => setMenu(true)}>
            <Menu size={22} />
          </button>
          <Link to="/" className="tn-logo" aria-label="El Maná Distribuidora - Inicio">
            <img src="/mana-logo.png" alt="El Maná Distribuidora" width={150} height={47} />
          </Link>
          <div className="tn-only-desktop tn-grow">
            <SearchBox />
          </div>
          <a className="tn-head-link tn-only-desktop" href={wa} target="_blank" rel="noreferrer">
            <MessageCircle size={20} />
            <span>
              <small>Consultas</small>
              WhatsApp
            </span>
          </a>
          <Link to="/panel" className="tn-head-link tn-only-desktop" title="Acceso para el personal de El Maná">
            <LogIn size={20} />
            <span>
              <small>Personal</small>
              Ingresar
            </span>
          </Link>
          <button type="button" className="tn-cart-btn" onClick={() => setOpen(true)} aria-label={`Carrito, ${count} productos`}>
            <ShoppingCart size={22} />
            {count > 0 && <span className="tn-cart-count">{count > 99 ? '99+' : count}</span>}
            <span className="tn-only-desktop">Carrito</span>
          </button>
        </div>
        <div className="tn-wrap tn-only-mobile tn-search-mobile">
          <SearchBox />
        </div>
      </header>

      <nav className="tn-nav tn-only-desktop" aria-label="Categorías" onMouseLeave={() => setMega(false)}>
        <div className="tn-wrap tn-nav-in">
          <button type="button" className={`tn-nav-all${mega ? ' on' : ''}`} onMouseEnter={() => setMega(true)} onClick={() => setMega((v) => !v)}>
            <LayoutGrid size={16} /> Categorías <ChevronDown size={14} />
          </button>
          <Link to="/ofertas" className="tn-nav-link hot">
            <Tag size={15} /> Ofertas
          </Link>
          {QUICK.map((c) => (
            <Link key={c.slug} to={`/categoria/${c.slug}`} className="tn-nav-link">
              {c.label}
            </Link>
          ))}
          <Link to="/productos" className="tn-nav-link">
            Ver todo
          </Link>
        </div>
        {mega && (
          <div className="tn-mega">
            <div className="tn-wrap tn-mega-grid">
              {categories.map((c) => {
                const Icon = CATEGORY_ICON[c.slug] ?? LayoutGrid;
                return (
                  <Link key={c.slug} to={`/categoria/${c.slug}`} className="tn-mega-item" style={{ '--c': categoryColor(c.slug) } as CSSProperties} onClick={() => setMega(false)}>
                    <span className="ic">
                      <Icon size={18} />
                    </span>
                    <span>
                      {c.name}
                      <small>{c.count} productos</small>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {menu && (
        <div className="tn-drawer-bg" onClick={() => setMenu(false)}>
          <aside className="tn-drawer left" onClick={(e) => e.stopPropagation()} aria-label="Menú">
            <div className="tn-drawer-head">
              <img src="/mana-logo.png" alt="El Maná" height={32} />
              <button type="button" className="tn-icon-btn" aria-label="Cerrar menú" onClick={() => setMenu(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="tn-drawer-body">
              <Link to="/ofertas" className="tn-menu-item hot" onClick={() => setMenu(false)}>
                <Tag size={18} /> Ofertas
              </Link>
              <Link to="/productos" className="tn-menu-item" onClick={() => setMenu(false)}>
                <LayoutGrid size={18} /> Todos los productos
              </Link>
              <div className="tn-menu-label">Categorías</div>
              {categories.map((c) => {
                const Icon = CATEGORY_ICON[c.slug] ?? LayoutGrid;
                return (
                  <Link key={c.slug} to={`/categoria/${c.slug}`} className="tn-menu-item" style={{ '--c': categoryColor(c.slug) } as CSSProperties} onClick={() => setMenu(false)}>
                    <Icon size={18} /> {c.name}
                    <small>{c.count}</small>
                  </Link>
                );
              })}
              <a className="tn-btn wa block" href={wa} target="_blank" rel="noreferrer" style={{ marginTop: 18 }}>
                <MessageCircle size={18} /> Escribinos por WhatsApp
              </a>
              <div className="tn-menu-label">El Maná</div>
              <Link to="/panel" className="tn-menu-item" onClick={() => setMenu(false)}>
                <LogIn size={18} /> Acceso del personal
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
