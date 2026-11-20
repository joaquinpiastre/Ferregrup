import { Clock, CreditCard, Landmark, MapPin, MessageCircle, Phone, Store, Truck, Wallet } from 'lucide-react';
import { Link } from './router';
import { useStore } from './context';
import { whatsappLink } from './data';

export default function Footer() {
  const { catalog } = useStore();
  const phone = catalog?.settings.whatsapp ?? '5492604696700';
  const n = catalog?.settings.cuotas ?? 3;
  const wa = whatsappLink(phone, 'Hola El Maná! Quería hacer una consulta.');
  const categories = (catalog?.categories ?? []).slice(0, 8);
  return (
    <footer className="tn-footer">
      <div className="tn-wrap tn-foot-grid">
        <div className="tn-foot-brand">
          <img src="/mana-logo.png" alt="El Maná Distribuidora" width={170} height={53} loading="lazy" />
          <p>Distribuidora de herramientas, pinturas y equipos para la obra en San Rafael, Mendoza. Marcas de confianza y atención personalizada.</p>
          <a className="tn-btn wa" href={wa} target="_blank" rel="noreferrer">
            <MessageCircle size={17} /> Escribinos
          </a>
        </div>
        <div>
          <h4>Categorías</h4>
          <ul>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link to={`/categoria/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
            <li>
              <Link to="/ofertas">Ofertas</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Ayuda</h4>
          <ul>
            <li>
              <Link to="/ayuda#como-comprar">Cómo comprar</Link>
            </li>
            <li>
              <Link to="/ayuda#envios">Envíos y retiro</Link>
            </li>
            <li>
              <Link to="/ayuda#pagos">Medios de pago</Link>
            </li>
            <li>
              <Link to="/ayuda#garantia">Garantía y cambios</Link>
            </li>
            <li>
              <Link to="/arrepentimiento" className="tn-foot-strong">
                Botón de arrepentimiento
              </Link>
            </li>
            <li>
              <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor" target="_blank" rel="noreferrer">
                Defensa de las y los consumidores
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Contacto</h4>
          <ul className="tn-foot-contact">
            <li>
              <Phone size={15} /> <a href={wa} target="_blank" rel="noreferrer">260 469-6700</a>
            </li>
            <li>
              <MapPin size={15} /> Av. Granaderos 575, San Rafael, Mendoza
            </li>
            <li>
              <Clock size={15} /> Lunes a viernes 8 a 18 h · Sábados 8:30 a 12:30 h
            </li>
          </ul>
          <h4 style={{ marginTop: 20 }}>Medios de pago</h4>
          <div className="tn-pay">
            <span>
              <CreditCard size={14} /> Tarjetas · {n} cuotas sin interés
            </span>
            <span>
              <Landmark size={14} /> Transferencia
            </span>
            <span>
              <Wallet size={14} /> Efectivo
            </span>
          </div>
          <div className="tn-pay" style={{ marginTop: 8 }}>
            <span>
              <Truck size={14} /> Envío a domicilio
            </span>
            <span>
              <Store size={14} /> Retiro en el local
            </span>
          </div>
        </div>
      </div>
      <div className="tn-foot-bottom">
        <div className="tn-wrap tn-foot-bottom-in">
          <span>© {new Date().getFullYear()} El Maná Distribuidora · San Rafael, Mendoza. Los precios incluyen IVA.</span>
          <a href="/panel" className="tn-foot-panel">
            Acceso al panel
          </a>
        </div>
      </div>
    </footer>
  );
}
