import { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLocation } from './router';
import { CartProvider } from './cart';
import { StoreProvider, useStore } from './context';
import { whatsappLink } from './data';
import Header from './Header';
import Footer from './Footer';
import CartDrawer from './CartDrawer';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductPage from './pages/ProductPage';
import Checkout from './pages/Checkout';
import OrderDone from './pages/OrderDone';
import NotFound from './pages/NotFound';
import { Arrepentimiento, Ayuda } from './pages/Info';
import './tienda.css';

function Routes() {
  const { path, query } = useLocation();
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  const [first, second] = parts;
  if (!first || first === 'tienda') return <Home />;
  if (first === 'productos') return <Catalog mode="all" query={query} />;
  if (first === 'ofertas') return <Catalog mode="offers" query={query} />;
  if (first === 'categoria' && second) return <Catalog mode="category" slug={second} query={query} />;
  if (first === 'marca' && second) return <Catalog mode="brand" slug={second} query={query} />;
  if (first === 'producto' && second) return <ProductPage slug={second} />;
  if (first === 'checkout' || first === 'carrito') return <Checkout />;
  if (first === 'pedido' && second) return <OrderDone id={second} />;
  if (first === 'ayuda') return <Ayuda />;
  if (first === 'arrepentimiento') return <Arrepentimiento />;
  return <NotFound />;
}

function FloatingWhatsapp() {
  const { catalog } = useStore();
  return (
    <a
      className="tn-wa-float"
      href={whatsappLink(catalog?.settings.whatsapp ?? '5492604696700', 'Hola El Maná! Quería hacer una consulta.')}
      target="_blank"
      rel="noreferrer"
      aria-label="Escribinos por WhatsApp"
    >
      <MessageCircle size={28} />
    </a>
  );
}

export default function TiendaApp() {
  // El panel usa fondo oscuro en el body: la tienda es clara.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#f6f5f2';
    return () => {
      document.body.style.background = prev;
    };
  }, []);
  return (
    <StoreProvider>
      <CartProvider>
        <div className="tn">
          <Header />
          <main className="tn-main">
            <Routes />
          </main>
          <Footer />
          <CartDrawer />
          <FloatingWhatsapp />
        </div>
      </CartProvider>
    </StoreProvider>
  );
}
