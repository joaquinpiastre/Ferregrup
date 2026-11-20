import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, BadgePercent, ChevronLeft, ChevronRight, Clock, CreditCard, Headphones, LayoutGrid, MapPin, MessageCircle, Store, Truck } from 'lucide-react';
import { Link } from '../router';
import { useStore } from '../context';
import { BRANDS, CATEGORY_ICON, categoryColor, slugify, whatsappLink, type StoreProduct } from '../data';
import { Loading, ProductGrid, ProductImage, ProductRail, SectionHead } from '../ui';

const ADDRESS = 'Av. Granaderos 575, San Rafael, Mendoza';
const vars = (v: Record<string, string>) => v as CSSProperties;

function pick(list: StoreProduct[], n: number) {
  return list.filter((p) => p.image).slice(0, n);
}

/** Mezcla para que no salgan seguidos productos del mismo tipo (por ejemplo, cinco hormigoneras). */
function mix(list: StoreProduct[]): StoreProduct[] {
  const groups = new Map<string, StoreProduct[]>();
  for (const p of list) {
    const k = p.name.split(' ')[0].toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out: StoreProduct[] = [];
  for (let i = 0; out.length < list.length; i++) for (const g of groups.values()) if (g[i]) out.push(g[i]);
  return out;
}

interface Slide {
  key: string;
  tone: 'teal' | 'red' | 'dark';
  eyebrow: string;
  title: ReactNode;
  text: string;
  cta: { to: string; label: string };
  sticker: ReactNode;
  images: StoreProduct[];
}

function Hero({ products, cuotas, maxOff }: { products: StoreProduct[]; cuotas: number; maxOff: number }) {
  const battery = pick(products.filter((p) => p.category === 'herramientas-a-bateria' && p.featured), 3);
  const batteryAll = battery.length >= 3 ? battery : pick(products.filter((p) => p.category === 'herramientas-a-bateria'), 3);
  // Ofertas del carrusel: las más vendibles, de rubros distintos.
  const offerCats = new Set<string | null>();
  const offers = pick(
    [...products]
      .filter((p) => p.offerPct && p.image)
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
      .filter((p) => (offerCats.has(p.category) ? false : (offerCats.add(p.category), true))),
    3
  );
  const obra = pick(
    [
      ...products.filter((p) => p.brand === 'Duroll' && /hormigonera/i.test(p.name)),
      ...products.filter((p) => p.brand === 'Andina' && /4 L/.test(p.name)),
      ...products.filter((p) => p.brand === 'Duroll' && /carretilla/i.test(p.name)),
    ],
    3
  );
  const slides: Slide[] = [
    {
      key: 'bateria',
      tone: 'teal',
      eyebrow: 'Herramientas a batería',
      title: (
        <>
          Libertad <em>sin cables</em> para trabajar donde quieras.
        </>
      ),
      text: 'Taladros, atornilladores, amoladoras y kits completos con batería y cargador de Total y Dowen Pagio.',
      cta: { to: '/categoria/herramientas-a-bateria', label: 'Ver herramientas a batería' },
      sticker: (
        <>
          <b>{cuotas}</b>
          <span>cuotas sin interés</span>
        </>
      ),
      images: batteryAll,
    },
    ...(offers.length
      ? [
          {
            key: 'ofertas',
            tone: 'red' as const,
            eyebrow: 'Ofertas de la semana',
            title: (
              <>
                Hasta <em>{Math.round(maxOff)}% OFF</em> en productos seleccionados.
              </>
            ),
            text: `Precios especiales en herramientas de marcas líderes, también en ${cuotas} cuotas sin interés.`,
            cta: { to: '/ofertas', label: 'Ver todas las ofertas' },
            sticker: (
              <>
                <span>hasta</span>
                <b>{Math.round(maxOff)}%</b>
                <span>OFF</span>
              </>
            ),
            images: offers,
          },
        ]
      : []),
    {
      key: 'obra',
      tone: 'dark',
      eyebrow: 'Construcción y pinturas',
      title: (
        <>
          Todo para la <em>obra</em>, de los cimientos a la última mano.
        </>
      ),
      text: 'Hormigoneras y carretillas Duroll, andamios, escaleras y pinturas Andina para interior y exterior.',
      cta: { to: '/categoria/construccion-y-obra', label: 'Ver construcción y obra' },
      sticker: (
        <>
          <b>Envío</b>
          <span>a tu obra</span>
        </>
      ),
      images: obra,
    },
  ];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % slides.length), 6500);
    return () => window.clearInterval(t);
  }, [paused, slides.length]);
  const s = slides[i % slides.length];
  return (
    <section className="tn-hero-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="tn-wrap">
        <div className={`tn-hero tone-${s.tone}`} key={s.key}>
          <div className="tn-hero-text">
            <span className="tn-chip">{s.eyebrow}</span>
            <h1>{s.title}</h1>
            <p>{s.text}</p>
            <div className="tn-hero-cta">
              <Link to={s.cta.to} className="tn-btn primary lg">
                {s.cta.label} <ArrowRight size={18} />
              </Link>
            </div>
            <div className="tn-hero-badges">
              <span>
                <CreditCard size={15} /> Hasta {cuotas} cuotas sin interés
              </span>
              <span>
                <Truck size={15} /> Envíos en San Rafael
              </span>
            </div>
          </div>
          <div className="tn-hero-art" aria-hidden="true">
            {s.images.map((p, k) => (
              <Link key={p.code} to={`/producto/${p.slug}`} className={`tn-hero-prod p${k}`} tabIndex={-1}>
                <ProductImage product={p} />
              </Link>
            ))}
            <span className="tn-hero-sticker">{s.sticker}</span>
          </div>
          <div className="tn-hero-nav">
            <button type="button" aria-label="Anterior" onClick={() => setI((x) => (x - 1 + slides.length) % slides.length)}>
              <ChevronLeft size={18} />
            </button>
            <div className="dots">
              {slides.map((sl, k) => (
                <button key={sl.key} type="button" aria-label={`Ir a ${sl.eyebrow}`} className={k === i % slides.length ? 'on' : ''} onClick={() => setI(k)} />
              ))}
            </div>
            <button type="button" aria-label="Siguiente" onClick={() => setI((x) => (x + 1) % slides.length)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tile(props: { to: string; tone: string; chip: string; title: string; text: string; cta: string; images: StoreProduct[]; className?: string }) {
  const { to, tone, chip, title, text, cta, images, className = '' } = props;
  return (
    <Link to={to} className={`tn-tile t-${tone} ${className}`}>
      <div className="tn-tile-text">
        <span className="tn-chip light">{chip}</span>
        <h3>{title}</h3>
        <p>{text}</p>
        <span className="tn-tile-cta">
          {cta} <ArrowRight size={15} />
        </span>
      </div>
      <div className="tn-tile-art" aria-hidden="true">
        {images.map((p) => (
          <span key={p.code}>
            <ProductImage product={p} />
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function Home() {
  const { catalog, error } = useStore();
  useEffect(() => {
    document.title = 'El Maná Distribuidora · Herramientas, pinturas y obra en San Rafael';
  }, []);
  const products = useMemo(() => catalog?.products ?? [], [catalog]);
  const cuotas = catalog?.settings.cuotas ?? 3;
  const offers = useMemo(() => products.filter((p) => p.offerPct).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)), [products]);
  const maxOff = offers.reduce((m, p) => Math.max(m, p.offerPct ?? 0), 0);
  const featured = useMemo(() => products.filter((p) => p.featured && !p.offerPct).slice(0, 10), [products]);
  const battery = useMemo(() => products.filter((p) => p.category === 'herramientas-a-bateria').slice(0, 14), [products]);
  const obra = useMemo(
    () => mix([...products.filter((p) => p.category === 'construccion-y-obra'), ...products.filter((p) => p.category === 'pinturas')]).slice(0, 14),
    [products]
  );
  // La foto de cada rubro: su producto más vendible que tenga foto.
  const coverOf = useMemo(() => {
    const m = new Map<string, StoreProduct>();
    for (const p of products) if (p.category && p.image && !m.has(p.category)) m.set(p.category, p);
    return m;
  }, [products]);
  const brandCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.brand) m.set(p.brand, (m.get(p.brand) ?? 0) + 1);
    return m;
  }, [products]);
  const byCat = (slug: string, n: number, filter: (p: StoreProduct) => boolean = () => true) => pick(products.filter((p) => p.category === slug && filter(p)), n);
  const wa = whatsappLink(catalog?.settings.whatsapp ?? '5492604696700', 'Hola El Maná! Quería hacer una consulta.');

  if (error) {
    return (
      <div className="tn-wrap tn-page">
        <div className="tn-alert">{error}</div>
      </div>
    );
  }

  return (
    <>
      {catalog ? (
        <Hero products={products} cuotas={cuotas} maxOff={maxOff} />
      ) : (
        <div className="tn-hero-wrap">
          <div className="tn-wrap">
            <div className="tn-hero tn-skeleton" />
          </div>
        </div>
      )}

      <section className="tn-wrap tn-benefits">
        <div className="tn-benefit b1">
          <span className="ic">
            <CreditCard size={22} />
          </span>
          <div>
            <b>Hasta {cuotas} cuotas sin interés</b>
            <span>Con tarjetas de crédito</span>
          </div>
        </div>
        <div className="tn-benefit b2">
          <span className="ic">
            <Truck size={22} />
          </span>
          <div>
            <b>Envío a domicilio</b>
            <span>En San Rafael y alrededores</span>
          </div>
        </div>
        <div className="tn-benefit b3">
          <span className="ic">
            <Store size={22} />
          </span>
          <div>
            <b>Retiro sin cargo</b>
            <span>Av. Granaderos 575</span>
          </div>
        </div>
        <div className="tn-benefit b4">
          <span className="ic">
            <Headphones size={22} />
          </span>
          <div>
            <b>Asesoramiento real</b>
            <span>Te ayudamos por WhatsApp</span>
          </div>
        </div>
      </section>

      <section className="tn-wrap tn-sec">
        <SectionHead
          eyebrow="Categorías"
          title="¿Qué necesitás hoy?"
          action={
            <Link to="/productos" className="tn-link">
              Ver todo <ArrowRight size={15} />
            </Link>
          }
        />
        <div className="tn-cats">
          {(catalog?.categories ?? []).map((c) => {
            const Icon = CATEGORY_ICON[c.slug] ?? LayoutGrid;
            const cover = coverOf.get(c.slug);
            return (
              <Link key={c.slug} to={`/categoria/${c.slug}`} className="tn-cat" style={vars({ '--c': categoryColor(c.slug) })}>
                <span className="ic">
                  <Icon size={20} />
                </span>
                <span className="tn-cat-text">
                  <b>{c.name}</b>
                  <small>{c.count} productos</small>
                </span>
                {cover && (
                  <span className="tn-cat-img" aria-hidden="true">
                    <ProductImage product={cover} />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {offers.length > 0 && (
        <section className="tn-band tn-band-offers">
          <div className="tn-wrap">
            <SectionHead
              eyebrow={`Hasta ${Math.round(maxOff)}% OFF`}
              title="Ofertas que no se repiten"
              action={
                <Link to="/ofertas" className="tn-link light">
                  Ver todas <ArrowRight size={15} />
                </Link>
              }
            />
            <ProductRail products={offers.slice(0, 16)} />
          </div>
        </section>
      )}

      <section className="tn-wrap tn-bento">
        <Tile
          className="big"
          to="/categoria/herramientas-electricas"
          tone="orange"
          chip="Potencia profesional"
          title="Herramientas eléctricas"
          text="Taladros, rotomartillos, amoladoras y sierras para cada trabajo."
          cta="Ver productos"
          images={byCat('herramientas-electricas', 2, (p) => p.featured || (p.rank ?? 1e9) < 60)}
        />
        <Tile to="/categoria/jardin-y-poda" tone="green" chip="Jardín y poda" title="Tu jardín, impecable" text="Bordeadoras, motosierras, cortadoras y tijeras." cta="Ver jardín" images={byCat('jardin-y-poda', 1)} />
        <Tile to="/categoria/pinturas" tone="pink" chip="Pinturas Andina" title="Renová tus ambientes" text="Látex, membranas, esmaltes y fijadores." cta="Ver pinturas" images={byCat('pinturas', 1, (p) => /4 L/.test(p.name))} />
        <Tile
          className="wide"
          to="/categoria/construccion-y-obra"
          tone="amber"
          chip="Construcción y obra"
          title="Equipá tu obra"
          text="Hormigoneras y carretillas Duroll, andamios y escaleras."
          cta="Ver construcción"
          images={pick(
            [...products.filter((p) => p.brand === 'Duroll' && /hormigonera/i.test(p.name)), ...products.filter((p) => p.brand === 'Duroll' && /carretilla/i.test(p.name))],
            2
          )}
        />
      </section>

      <section className="tn-band tn-band-cream">
        <div className="tn-wrap">
          <SectionHead eyebrow="Los más elegidos" title="Lo que más se llevan nuestros clientes" />
          {catalog ? <ProductGrid products={featured} /> : <Loading />}
        </div>
      </section>

      <section className="tn-band tn-band-dark tn-brands-band">
        <div className="tn-wrap">
          <SectionHead eyebrow="Marcas" title="Trabajamos con marcas que rinden" />
        </div>
        <div className="tn-marquee">
          <div className="tn-marquee-track">
            {[...BRANDS, ...BRANDS].map((b, k) => {
              const copy = k >= BRANDS.length;
              const count = brandCount.get(b.name) ?? 0;
              const inner = (
                <>
                  <img src={b.logo} alt={copy ? '' : b.name} loading="lazy" />
                  <small>{count ? `${count} productos` : 'Consultanos'}</small>
                </>
              );
              return count ? (
                <Link key={k} to={`/marca/${slugify(b.name)}`} className="tn-brand" aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined}>
                  {inner}
                </Link>
              ) : (
                <a
                  key={k}
                  href={whatsappLink(catalog?.settings.whatsapp ?? '5492604696700', `Hola! Quería consultar por productos ${b.name}.`)}
                  target="_blank"
                  rel="noreferrer"
                  className="tn-brand"
                  aria-hidden={copy || undefined}
                  tabIndex={copy ? -1 : undefined}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {battery.length > 0 && (
        <section className="tn-band tn-band-teal">
          <div className="tn-wrap">
            <SectionHead
              eyebrow="A batería"
              title="Kits listos para trabajar"
              action={
                <Link to="/categoria/herramientas-a-bateria" className="tn-link">
                  Ver todos <ArrowRight size={15} />
                </Link>
              }
            />
            <ProductRail products={battery} />
          </div>
        </section>
      )}

      {obra.length > 0 && (
        <section className="tn-wrap tn-sec">
          <SectionHead
            eyebrow="Obra y pinturas"
            title="Para construir y terminar bien"
            action={
              <Link to="/categoria/construccion-y-obra" className="tn-link">
                Ver construcción <ArrowRight size={15} />
              </Link>
            }
          />
          <ProductRail products={obra} />
        </section>
      )}

      <section className="tn-band tn-band-orange">
        <div className="tn-wrap">
          <SectionHead eyebrow="Por qué El Maná" title="Una distribuidora cercana, que responde" />
          <div className="tn-why">
            <div>
              <span className="ic">
                <BadgePercent size={22} />
              </span>
              <h3>Precios de distribuidora</h3>
              <p>Compramos directo a las marcas y lo trasladamos al precio, también en cuotas sin interés.</p>
            </div>
            <div>
              <span className="ic">
                <Headphones size={22} />
              </span>
              <h3>Te asesoramos de verdad</h3>
              <p>Te ayudamos a elegir lo que realmente necesitás, por WhatsApp o en el local.</p>
            </div>
            <div>
              <span className="ic">
                <Truck size={22} />
              </span>
              <h3>Reparto propio</h3>
              <p>Nuestros repartidores recorren San Rafael y la zona: tu pedido llega sin vueltas.</p>
            </div>
            <div>
              <span className="ic">
                <Store size={22} />
              </span>
              <h3>Local a la calle</h3>
              <p>Pasá a retirar sin cargo o a ver los productos en Av. Granaderos 575.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="tn-wrap tn-sec tn-visit">
        <div className="tn-visit-card">
          <span className="tn-chip">Visitanos</span>
          <h2>Estamos en San Rafael</h2>
          <ul>
            <li>
              <MapPin size={18} /> {ADDRESS}
            </li>
            <li>
              <Clock size={18} /> Lunes a viernes de 8:00 a 18:00 · Sábados de 8:30 a 12:30
            </li>
          </ul>
          <a className="tn-btn wa lg" href={wa} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> Escribinos por WhatsApp
          </a>
        </div>
        <div className="tn-visit-map">
          <iframe title="Cómo llegar a El Maná" loading="lazy" src={`https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed`} />
        </div>
      </section>
    </>
  );
}
