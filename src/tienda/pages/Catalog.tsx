import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { Link, navigate } from '../router';
import { useStore } from '../context';
import { BRANDS, CATEGORY_ICON, categoryColor, searchProducts, slugify, type StoreProduct } from '../data';
import { Loading, ProductGrid } from '../ui';

type Sort = 'destacados' | 'menor' | 'mayor' | 'nombre' | 'descuento';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'destacados', label: 'Destacados' },
  { id: 'menor', label: 'Menor precio' },
  { id: 'mayor', label: 'Mayor precio' },
  { id: 'descuento', label: 'Mayor descuento' },
  { id: 'nombre', label: 'Nombre (A-Z)' },
];
const PRICE_RANGES = [
  { id: '0-25000', label: 'Hasta $ 25.000', min: 0, max: 25000 },
  { id: '25000-100000', label: '$ 25.000 a $ 100.000', min: 25000, max: 100000 },
  { id: '100000-300000', label: '$ 100.000 a $ 300.000', min: 100000, max: 300000 },
  { id: '300000-', label: 'Más de $ 300.000', min: 300000, max: Infinity },
];
const PAGE = 24;

interface Props {
  mode: 'all' | 'category' | 'brand' | 'offers';
  slug?: string;
  query: URLSearchParams;
}

function sortProducts(list: StoreProduct[], sort: Sort): StoreProduct[] {
  const out = [...list];
  if (sort === 'menor') out.sort((a, b) => a.price - b.price);
  else if (sort === 'mayor') out.sort((a, b) => b.price - a.price);
  else if (sort === 'nombre') out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  else if (sort === 'descuento') out.sort((a, b) => (b.offerPct ?? 0) - (a.offerPct ?? 0) || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  else out.sort((a, b) => Number(b.featured) - Number(a.featured) || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  return out;
}

export default function Catalog({ mode, slug, query }: Props) {
  const { catalog, error, categoryName } = useStore();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = query.get('q') ?? '';
  const sort = (query.get('orden') as Sort) || 'destacados';
  const brandParam = mode === 'brand' ? slug ?? '' : query.get('marca') ?? '';
  const price = query.get('precio') ?? '';
  const onlyOffers = mode === 'offers' || query.get('ofertas') === '1';
  const category = mode === 'category' ? slug ?? '' : query.get('cat') ?? '';

  // Cada filtro cuenta con todos los demás aplicados (menos él mismo): así las cantidades de
  // categorías y marcas coinciden con lo que aparece al tocarlas.
  const searched = useMemo(() => {
    let list = catalog?.products ?? [];
    if (q) list = searchProducts(list, q);
    if (onlyOffers) list = list.filter((p) => p.offerPct);
    const range = PRICE_RANGES.find((r) => r.id === price);
    if (range) list = list.filter((p) => p.price >= range.min && p.price < range.max);
    return list;
  }, [catalog, q, onlyOffers, price]);
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of searched) if (p.category && (!brandParam || (p.brand && slugify(p.brand) === brandParam))) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [searched, brandParam]);
  const base = useMemo(() => (category ? searched.filter((p) => p.category === category) : searched), [searched, category]);

  const brands = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of base) if (p.brand) m.set(p.brand, (m.get(p.brand) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);

  const filtered = useMemo(
    () => sortProducts(brandParam ? base.filter((p) => !!p.brand && slugify(p.brand) === brandParam) : base, sort),
    [base, brandParam, sort]
  );

  const filterKey = `${mode}|${slug}|${query.toString()}`;
  const [page, setPage] = useState({ key: filterKey, n: PAGE });
  const shown = page.key === filterKey ? page.n : PAGE;

  const brandName = BRANDS.find((b) => slugify(b.name) === brandParam)?.name ?? catalog?.products.find((p) => p.brand && slugify(p.brand) === brandParam)?.brand ?? brandParam;
  const title =
    mode === 'offers' ? 'Ofertas' : mode === 'category' ? categoryName(category) : mode === 'brand' ? brandName : q ? `Resultados para “${q}”` : 'Todos los productos';

  useEffect(() => {
    document.title = `${title} · El Maná Distribuidora`;
  }, [title]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    navigate(`${window.location.pathname}${s ? `?${s}` : ''}`, { keepScroll: true });
  }

  const Icon = mode === 'category' ? CATEGORY_ICON[category] : null;

  const filters = (
    <div className="tn-filters">
      {mode !== 'category' && (
        <div className="tn-filter">
          <h4>Categorías</h4>
          <ul>
            {(catalog?.categories ?? [])
              .filter((c) => categoryCounts.has(c.slug) || category === c.slug)
              .map((c) => (
                <li key={c.slug}>
                  <button type="button" className={category === c.slug ? 'on' : ''} onClick={() => setParam('cat', category === c.slug ? null : c.slug)}>
                    {c.name} <small>{categoryCounts.get(c.slug) ?? 0}</small>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
      {mode !== 'brand' && brands.length > 1 && (
        <div className="tn-filter">
          <h4>Marcas</h4>
          <ul>
            {brands.map(([b, n]) => (
              <li key={b}>
                <button type="button" className={brandParam === slugify(b) ? 'on' : ''} onClick={() => setParam('marca', brandParam === slugify(b) ? null : slugify(b))}>
                  {b} <small>{n}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="tn-filter">
        <h4>Precio</h4>
        <ul>
          {PRICE_RANGES.map((r) => (
            <li key={r.id}>
              <button type="button" className={price === r.id ? 'on' : ''} onClick={() => setParam('precio', price === r.id ? null : r.id)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {mode !== 'offers' && (
        <label className="tn-check">
          <input type="checkbox" checked={onlyOffers} onChange={(e) => setParam('ofertas', e.target.checked ? '1' : null)} /> Solo productos en oferta
        </label>
      )}
    </div>
  );

  const active = [
    q && { label: `“${q}”`, clear: () => setParam('q', null) },
    mode !== 'category' && category && { label: categoryName(category), clear: () => setParam('cat', null) },
    mode !== 'brand' && brandParam && { label: brandName, clear: () => setParam('marca', null) },
    price && { label: PRICE_RANGES.find((r) => r.id === price)?.label ?? price, clear: () => setParam('precio', null) },
    mode !== 'offers' && query.get('ofertas') === '1' && { label: 'En oferta', clear: () => setParam('ofertas', null) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  // Encabezado de color: el de la categoría, rojo para ofertas y oscuro para el resto.
  const tone = mode === 'offers' ? 'offers' : mode === 'category' ? 'category' : 'dark';
  const brandLogo = mode === 'brand' ? BRANDS.find((b) => slugify(b.name) === brandParam)?.logo : undefined;

  return (
    <>
      <div className={`tn-page-hero tone-${tone}`} style={{ '--c': categoryColor(category) } as CSSProperties}>
        <div className="tn-wrap">
          <nav className="tn-crumbs" aria-label="Estás en">
            <Link to="/">Inicio</Link>
            <ChevronRight size={14} />
            {mode === 'all' || mode === 'offers' ? <span>{title}</span> : (
              <>
                <Link to="/productos">Productos</Link>
                <ChevronRight size={14} />
                <span>{title}</span>
              </>
            )}
          </nav>
          <div className="tn-cat-head">
            <div>
              <h1>
                {Icon && (
                  <span className="ic">
                    <Icon size={24} />
                  </span>
                )}
                {brandLogo ? (
                  <span className="tn-hero-brand">
                    <img src={brandLogo} alt={title} />
                  </span>
                ) : (
                  title
                )}
              </h1>
              <p>{catalog ? `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}` : 'Cargando…'}</p>
            </div>
            <div className="tn-cat-tools">
              <button type="button" className="tn-btn ghost tn-only-mobile" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={16} /> Filtros
              </button>
              <label className="tn-sort">
                Ordenar
                <select value={sort} onChange={(e) => setParam('orden', e.target.value === 'destacados' ? null : e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div className="tn-wrap tn-page tn-page-list">
        {active.length > 0 && (
          <div className="tn-active">
            {active.map((a) => (
              <button key={a.label} type="button" onClick={a.clear}>
                {a.label} <X size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="tn-cat-layout">
          <aside className="tn-only-desktop">{filters}</aside>
          <div>
            {error ? (
              <div className="tn-alert">{error}</div>
            ) : !catalog ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <div className="tn-empty">
                <h3>No encontramos productos con esos filtros.</h3>
                <p>Probá con otras palabras o escribinos: seguro lo conseguimos.</p>
                <Link to="/productos" className="tn-btn primary">
                  Ver todos los productos
                </Link>
              </div>
            ) : (
              <>
                <ProductGrid products={filtered.slice(0, shown)} />
                {filtered.length > shown && (
                  <div className="tn-more">
                    <span>
                      Mostrando {shown} de {filtered.length}
                    </span>
                    <button type="button" className="tn-btn ghost" onClick={() => setPage({ key: filterKey, n: shown + PAGE })}>
                      Ver más productos
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {filtersOpen && (
          <div className="tn-drawer-bg" onClick={() => setFiltersOpen(false)}>
            <aside className="tn-drawer left" onClick={(e) => e.stopPropagation()} aria-label="Filtros">
              <div className="tn-drawer-head">
                <strong>
                  <SlidersHorizontal size={18} /> Filtros
                </strong>
                <button type="button" className="tn-icon-btn" aria-label="Cerrar filtros" onClick={() => setFiltersOpen(false)}>
                  <X size={22} />
                </button>
              </div>
              <div className="tn-drawer-body">{filters}</div>
              <div className="tn-drawer-foot">
                <button type="button" className="tn-btn primary block" onClick={() => setFiltersOpen(false)}>
                  Ver {filtered.length} productos
                </button>
              </div>
            </aside>
          </div>
        )}
        {catalog && filtered.length > 0 && <p className="tn-legal">Precios finales con IVA incluido. Las imágenes son ilustrativas.</p>}
      </div>
    </>
  );
}
