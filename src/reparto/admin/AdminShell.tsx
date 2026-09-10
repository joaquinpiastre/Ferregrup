import { useCallback, useEffect, useState } from 'react';
import { Send, MapPin, CalendarClock, Map, History, UserCheck, Package, UserCog, Radio, Wallet, Banknote, ShoppingCart, Target, Building2, ScrollText, FileText, BarChart3 } from 'lucide-react';
import AppSidebar from '../../components/AppSidebar';
import type { SidebarSection } from '../../components/AppSidebar';
import { fetchStreetOrders, subscribeStreetOrders } from '../api';
import PedidosCalleActivos from './PedidosCalleActivos';
import PedidosCalleHistorial from './PedidosCalleHistorial';
import RutasPanel from './RutasPanel';
import PlanificacionPanel from './PlanificacionPanel';
import MapaVivo from './MapaVivo';
import HistorialPanel from './HistorialPanel';
import ClientesPanel from '../shared/ClientesPanel';
import CatalogoPanel from '../shared/CatalogoPanel';
import EquipoPanel from './EquipoPanel';
import TrackersPanel from './TrackersPanel';
import CobrosPanel from './CobrosPanel';
import CuentasPanel from './CuentasPanel';
import VentasPanel from './VentasPanel';
import CotizacionesPanel from './CotizacionesPanel';
import EstadisticasPanel from './EstadisticasPanel';
import ObjetivosPanel from './ObjetivosPanel';
import ProveedoresPanel from './ProveedoresPanel';
import LogsPanel from './LogsPanel';
import type { Session, StreetOrder } from '../types';

interface Props {
  session: Session;
  onLogout: () => void;
}

type Section =
  | 'pedidos' | 'rutas' | 'planificacion' | 'mapa' | 'historial'
  | 'clientes' | 'catalogo'
  | 'equipo' | 'trackers'
  | 'estadisticas' | 'cobros' | 'cuentas' | 'ventas' | 'cotizaciones' | 'objetivos' | 'proveedores'
  | 'logs';

const sections: SidebarSection[] = [
  {
    label: 'Operación',
    links: [
      { id: 'pedidos', label: 'Pedidos en calle', icon: Send },
      { id: 'rutas', label: 'Rutas del día', icon: MapPin },
      { id: 'planificacion', label: 'Planificación', icon: CalendarClock },
      { id: 'mapa', label: 'Mapa en vivo', icon: Map },
      { id: 'historial', label: 'Historial', icon: History },
    ],
  },
  {
    label: 'Directorio',
    links: [
      { id: 'clientes', label: 'Clientes', icon: UserCheck },
      { id: 'catalogo', label: 'Catálogo', icon: Package },
    ],
  },
  {
    label: 'Finanzas',
    links: [
      { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
      { id: 'cuentas', label: 'Cuentas de clientes', icon: Banknote },
      { id: 'cobros', label: 'Cobros', icon: Wallet },
      { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
      { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
      { id: 'objetivos', label: 'Objetivos', icon: Target },
      { id: 'proveedores', label: 'Proveedores', icon: Building2 },
    ],
  },
  {
    label: 'Administración',
    links: [
      { id: 'equipo', label: 'Equipo', icon: UserCog },
      { id: 'trackers', label: 'Trackers', icon: Radio },
      { id: 'logs', label: 'Actividad', icon: ScrollText },
    ],
  },
];

export default function AdminShell({ session, onLogout }: Props) {
  const [section, setSection] = useState<Section>('pedidos');
  const [pedidosTab, setPedidosTab] = useState<'activos' | 'historial'>('activos');
  const [orders, setOrders] = useState<StreetOrder[]>([]);
  const [error, setError] = useState('');

  useEffect(
    () => subscribeStreetOrders(session.token, (list) => { setOrders(list); setError(''); }, (e) => setError(e instanceof Error ? e.message : 'Error de conexión.')),
    [session.token]
  );

  const refreshOrders = useCallback(() => {
    fetchStreetOrders(session.token).then(setOrders).catch(() => {});
  }, [session.token]);

  return (
    <div className="app-shell">
      <AppSidebar
        brand="FERREGRUP"
        tagline="Panel de Mostrador"
        sections={sections}
        activeId={section}
        onNavigate={(id) => setSection(id as Section)}
        userLabel={session.staff.name}
        onLogout={onLogout}
      />
      <main className="app-main">
        <div style={{ padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                {sections.flatMap((s) => s.links).find((l) => l.id === section)?.label}
              </h1>
            </div>
            {section === 'pedidos' && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={pedidosTab === 'activos' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setPedidosTab('activos')}>Activos</button>
                <button className={pedidosTab === 'historial' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setPedidosTab('historial')}>Historial</button>
              </div>
            )}
          </div>

          {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}

          {section === 'pedidos' && (pedidosTab === 'activos'
            ? <PedidosCalleActivos session={session} orders={orders} onOrderChanged={refreshOrders} />
            : <PedidosCalleHistorial orders={orders} />)}
          {section === 'rutas' && <RutasPanel token={session.token} />}
          {section === 'planificacion' && <PlanificacionPanel token={session.token} />}
          {section === 'mapa' && <MapaVivo token={session.token} />}
          {section === 'historial' && <HistorialPanel token={session.token} />}
          {section === 'clientes' && <ClientesPanel token={session.token} canDelete />}
          {section === 'catalogo' && <CatalogoPanel token={session.token} canEdit />}
          {section === 'equipo' && <EquipoPanel token={session.token} currentUserId={session.staff.id} />}
          {section === 'trackers' && <TrackersPanel token={session.token} />}
          {section === 'estadisticas' && <EstadisticasPanel token={session.token} />}
          {section === 'cobros' && <CobrosPanel token={session.token} />}
          {section === 'cuentas' && <CuentasPanel token={session.token} />}
          {section === 'ventas' && <VentasPanel token={session.token} />}
          {section === 'cotizaciones' && <CotizacionesPanel token={session.token} />}
          {section === 'objetivos' && <ObjetivosPanel token={session.token} />}
          {section === 'proveedores' && <ProveedoresPanel token={session.token} />}
          {section === 'logs' && <LogsPanel token={session.token} />}
        </div>
      </main>
    </div>
  );
}
