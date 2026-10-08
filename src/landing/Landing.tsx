import { useEffect, useState } from 'react';
import { ArrowRight, Clock, LogIn, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Drill, Hammer, Pliers, Screwdriver, Tape, Wrench } from './illustrations';
import './landing.css';

interface Props {
  onEnterPanel: () => void;
  hasSession: boolean;
}

const WHATSAPP = '5492604603702';
const WA_LINK = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola El Maná! Quería consultar por productos.')}`;
const ADDRESS = 'Av. Granaderos 575, San Rafael, Mendoza';

const BRANDS = [
  { name: 'Dowen Pagio', logo: '/marcas/dowen-pagio.svg', color: '#FE4806', desc: 'Herramientas eléctricas y de mano para el hogar, el taller y la obra.' },
  { name: 'Crossmaster', logo: '/marcas/crossmaster.png', color: '#facc15', desc: 'Herramientas, accesorios y equipos de taller con excelente relación precio-calidad.' },
  { name: 'BTA', logo: '/marcas/bta.png', color: '#a3a3a3', desc: 'Línea de herramientas para uso diario, confiables y de fácil reposición.' },
  { name: 'Biassoni', logo: '/marcas/biassoni.png', color: '#e3283c', desc: 'Herramientas profesionales de manos, obra y poda pensadas para trabajo exigente.' },
];

const PRODUCTS = [
  { title: 'Herramientas eléctricas', text: 'Amoladoras, taladros y atornilladores a batería para trabajar más rápido.', tag: 'Dowen Pagio', img: '/productos/electricas.jpg' },
  { title: 'Amoladoras y abrasivos', text: 'Discos de desbaste, corte y lijado para cada material.', tag: 'Crossmaster', img: '/productos/abrasivos.jpg' },
  { title: 'Llaves y ajuste', text: 'Llaves combinadas y de ajuste para mecánica y mantenimiento.', tag: 'Biassoni', img: '/productos/llaves.jpg' },
  { title: 'Herramientas de obra', text: 'Picos, piquetas y herramientas robustas para construcción.', tag: 'Biassoni', img: '/productos/obra.jpg' },
  { title: 'Poda y jardín', text: 'Tijeras de podar y herramientas de mano para campo y jardín.', tag: 'Biassoni', img: '/productos/poda.jpg' },
  { title: 'Taller y mecánica', text: 'Crics, engrasadoras y equipos para el taller.', tag: 'Crossmaster', img: '/productos/taller.jpg' },
];

const WHY = [
  { n: '01', t: 'Marcas de confianza', p: 'Trabajamos con fabricantes reconocidos para que lleves herramientas que duran.' },
  { n: '02', t: 'Atención personalizada', p: 'Te asesoramos por WhatsApp o en persona para elegir lo que realmente necesitás.' },
  { n: '03', t: 'Reparto a domicilio', p: 'Nuestros repartidores recorren la zona para que no pierdas tiempo en traslados.' },
  { n: '04', t: 'Facilidades de pago', p: 'Cuotas semanales y cuenta corriente para clientes, con seguimiento claro.' },
];

const MARQUEE = ['Dowen Pagio', 'Crossmaster', 'BTA', 'Biassoni', 'Distribuidora de herramientas', 'San Rafael · Mendoza'];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.lp-rv');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.12 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

export default function Landing({ onEnterPanel, hasSession }: Props) {
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const panelLabel = hasSession ? 'Ir al panel' : 'Iniciar sesión';

  return (
    <div className="lp">
      <header className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <a href="#inicio"><img src="/mana-logo.png" alt="El Maná Distribuidora" /></a>
          <nav className="lp-links">
            <a href="#marcas">Marcas</a>
            <a href="#productos">Productos</a>
            <a href="#nosotros">Nosotros</a>
            <a href="#contacto">Contacto</a>
          </nav>
          <button className="lp-btn primary sm" onClick={onEnterPanel}><LogIn size={15} /> {panelLabel}</button>
        </div>
      </header>

      <section className="lp-hero" id="inicio">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <img className="lp-hero-logo" src="/mana-logo.png" alt="El Maná Distribuidora" />
            <h1>Las herramientas que tu trabajo <em>necesita</em>, al alcance de tu mano.</h1>
            <p className="lead">
              Distribuimos las mejores marcas de herramientas para ferreterías, talleres y profesionales de San Rafael y toda la zona.
            </p>
            <div className="lp-cta">
              <a className="lp-btn primary" href={WA_LINK} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Consultar por WhatsApp</a>
              <a className="lp-btn ghost" href="#productos">Ver productos <ArrowRight size={16} /></a>
            </div>
            <div className="lp-stats">
              <div><b>4</b><span>marcas líderes</span></div>
              <div><b>+6</b><span>rubros de productos</span></div>
              <div><b>100%</b><span>atención personalizada</span></div>
            </div>
          </div>

          <div className="lp-stage" aria-hidden="true">
            <div className="lp-ring" />
            <div className="lp-ring r2" />
            <div className="lp-disc"><Wrench /></div>
            <div className="lp-float"><Drill /></div>
            <div className="lp-float"><Hammer /></div>
            <div className="lp-float"><Pliers /></div>
            <div className="lp-float"><Tape /></div>
            <div className="lp-float"><Screwdriver /></div>
          </div>
        </div>
      </section>

      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-track">
          {[0, 1].map((k) => MARQUEE.map((m) => <span key={`${k}-${m}`}>{m}</span>))}
        </div>
      </div>

      <section className="lp-sec" id="marcas">
        <div className="lp-wrap">
          <div className="lp-rv">
            <div className="lp-eyebrow">Nuestras marcas</div>
            <h2>Trabajamos con las marcas que los profesionales eligen.</h2>
            <p className="sub">Una selección de fabricantes para cubrir desde el uso doméstico hasta el trabajo más exigente.</p>
          </div>
          <div className="lp-brands">
            {BRANDS.map(({ name, logo, color, desc }, i) => (
              <article key={name} className="lp-brand lp-rv" style={{ ['--bc' as string]: color, transitionDelay: `${i * 90}ms` }}>
                <div className="logo"><img src={logo} alt={name} loading="lazy" /></div>
                <p className="ds">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec" id="productos" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-rv">
            <div className="lp-eyebrow">Productos</div>
            <h2>Todo lo que necesitás para dejar el trabajo bien hecho.</h2>
            <p className="sub">Un catálogo pensado para el ferretero, el mecánico, el albañil y el que arregla en casa.</p>
          </div>
          <div className="lp-prods">
            {PRODUCTS.map(({ title, text, tag, img }, i) => (
              <article key={title} className="lp-prod lp-rv" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                <div className="photo"><img src={img} alt={title} loading="lazy" /><span className="tag">{tag}</span></div>
                <div className="body"><h3>{title}</h3><p>{text}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-why" id="nosotros">
        <div className="lp-wrap">
          <div className="lp-rv">
            <div className="lp-eyebrow">Por qué El Maná</div>
            <h2>Una distribuidora cercana, con respuesta rápida.</h2>
          </div>
          <div className="lp-why-grid lp-rv">
            {WHY.map((w) => (
              <div key={w.n} className="lp-why-item">
                <div className="n">{w.n}</div>
                <h3>{w.t}</h3>
                <p>{w.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec" id="contacto">
        <div className="lp-wrap">
          <div className="lp-rv">
            <div className="lp-eyebrow">Contacto</div>
            <h2>Hablemos. Te respondemos al instante.</h2>
          </div>
          <div className="lp-contact">
            <div className="lp-card hl lp-rv">
              <h3>Escribinos por WhatsApp</h3>
              <p style={{ margin: '10px 0 0', opacity: .9, lineHeight: 1.55 }}>Consultá precios, disponibilidad y condiciones de entrega.</p>
              <div className="lp-row">
                <div className="ic"><Phone size={20} /></div>
                <div><b>WhatsApp</b><span>260 460-3702</span></div>
              </div>
              <a className="lp-btn" style={{ background: '#fff', color: '#c93500', marginTop: 28, position: 'relative', zIndex: 1 }} href={WA_LINK} target="_blank" rel="noreferrer">
                <MessageCircle size={17} /> Abrir chat
              </a>
            </div>
            <div className="lp-card lp-rv">
              <h3>Dónde estamos</h3>
              <div className="lp-row">
                <div className="ic"><MapPin size={20} color="#FE4806" /></div>
                <div><b>Dirección</b><span>Av. Granaderos 575<br />San Rafael, Mendoza</span></div>
              </div>
              <div className="lp-row" style={{ marginTop: 16 }}>
                <div className="ic"><Clock size={20} color="#FE4806" /></div>
                <div><b>Horarios</b><span>Consultá por WhatsApp</span></div>
              </div>
              <div className="lp-map">
                <iframe title="Mapa El Maná" loading="lazy" src={`https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed`} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <img src="/mana-logo.png" alt="El Maná" />
          <span>© {new Date().getFullYear()} El Maná Distribuidora · San Rafael, Mendoza</span>
          <button onClick={onEnterPanel}>Acceso al panel</button>
        </div>
      </footer>

      <a className="lp-wa" href={WA_LINK} target="_blank" rel="noreferrer" aria-label="WhatsApp">
        <MessageCircle size={28} color="#fff" />
      </a>
    </div>
  );
}

