import { useCallback, useEffect, useState } from 'react';
import { Home as HomeIcon, MapPin, Send, UserCheck, Package, Wallet } from 'lucide-react';
import AppSidebar from '../../components/AppSidebar';
import type { SidebarSection } from '../../components/AppSidebar';
import { endShift, fetchActiveShift, fetchRouteStops, fetchStreetOrders, postGpsUpdate, startShift, subscribeRouteStops, subscribeStreetOrders } from '../api';
import Home from './Home';
import RutaDelDia from './RutaDelDia';
import PedidoCalle from './PedidoCalle';
import ClientesPanel from '../shared/ClientesPanel';
import CatalogoPanel from '../shared/CatalogoPanel';
import CobrosForm from './CobrosForm';
import type { RouteStop, Session, Shift, StreetOrder } from '../types';

interface Props {
  session: Session;
  onLogout: () => void;
}

type Section = 'home' | 'ruta' | 'pedido' | 'clientes' | 'catalogo' | 'cobros';

const TITLES: Record<Section, string> = {
  home: 'Inicio',
  ruta: 'Mi ruta',
  pedido: 'Pedido en calle',
  clientes: 'Clientes',
  catalogo: 'Catálogo',
  cobros: 'Cobros',
};

const sections: SidebarSection[] = [
  {
    label: 'Repartidor',
    links: [
      { id: 'home', label: 'Inicio', icon: HomeIcon },
      { id: 'ruta', label: 'Mi ruta', icon: MapPin },
      { id: 'pedido', label: 'Pedido en calle', icon: Send },
      { id: 'clientes', label: 'Clientes', icon: UserCheck },
      { id: 'catalogo', label: 'Catálogo', icon: Package },
      { id: 'cobros', label: 'Cobros', icon: Wallet },
    ],
  },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RepartidorShell({ session, onLogout }: Props) {
  const [section, setSection] = useState<Section>('home');
  const [shift, setShift] = useState<Shift | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [orders, setOrders] = useState<StreetOrder[]>([]);

  useEffect(() => {
    fetchActiveShift(session.token).then(setShift).catch(() => {});
  }, [session.token]);

  useEffect(
    () => subscribeRouteStops(session.token, today(), session.staff.id, setStops),
    [session.token, session.staff.id]
  );

  useEffect(() => subscribeStreetOrders(session.token, setOrders), [session.token]);

  useEffect(() => {
    if (!shift || !('geolocation' in navigator)) return;
    const post = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => void postGpsUpdate(session.token, pos.coords.latitude, pos.coords.longitude).catch(() => {}),
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 }
      );
    };
    post();
    const interval = setInterval(post, 20000);
    return () => clearInterval(interval);
  }, [shift, session.token]);

  const refreshOrders = useCallback(() => {
    fetchStreetOrders(session.token).then(setOrders).catch(() => {});
  }, [session.token]);

  const refreshStops = useCallback(() => {
    fetchRouteStops(session.token, today(), session.staff.id).then(setStops).catch(() => {});
  }, [session.token, session.staff.id]);

  async function handleStart() {
    const id = await startShift(session.token, session.staff.id, session.staff.name);
    setShift({ id, courierId: session.staff.id, courierName: session.staff.name, startedAt: Date.now(), completedCount: 0, totalCount: stops.length });
  }

  async function handleEnd() {
    if (!shift) return;
    if (!confirm('¿Terminar el turno?')) return;
    await endShift(session.token, shift.id);
    setShift(null);
  }

  return (
    <div className="app-shell">
      <AppSidebar
        brand="FERREGRUP"
        tagline="Panel de Repartidor"
        sections={sections}
        activeId={section}
        onNavigate={(id) => setSection(id as Section)}
        userLabel={session.staff.name}
        onLogout={onLogout}
      />
      <main className="app-main">
        <div style={{ padding: '28px 32px', maxWidth: 620 }}>
          {section !== 'home' && (
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 20 }}>{TITLES[section]}</h1>
          )}
          {section === 'home' && <Home courierName={session.staff.name} shift={shift} stops={stops} onStart={handleStart} onEnd={handleEnd} />}
          {section === 'ruta' && <RutaDelDia session={session} stops={stops} onChanged={refreshStops} />}
          {section === 'pedido' && <PedidoCalle session={session} orders={orders} onOrderCreated={(o) => setOrders((prev) => [o, ...prev])} onOrderChanged={refreshOrders} />}
          {section === 'clientes' && <ClientesPanel token={session.token} canDelete={false} />}
          {section === 'catalogo' && <CatalogoPanel token={session.token} canEdit={false} />}
          {section === 'cobros' && <CobrosForm session={session} />}
        </div>
      </main>
    </div>
  );
}
