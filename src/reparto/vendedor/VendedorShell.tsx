import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Boxes, FileText, Home as HomeIcon, Package, ShoppingCart, Sparkles, UserCheck, Wallet } from 'lucide-react';
import AppSidebar from '../../components/AppSidebar';
import type { SidebarSection } from '../../components/AppSidebar';
import { subscribeGoals } from '../api';
import GoalProgressBar from '../shared/GoalProgressBar';
import AsistentePanel from '../shared/AsistentePanel';
import ClientesPanel from '../shared/ClientesPanel';
import CatalogoPanel from '../shared/CatalogoPanel';
import StockPanel from '../admin/StockPanel';
import VentasPanel from '../admin/VentasPanel';
import CotizacionesPanel from '../admin/CotizacionesPanel';
import CuentasPanel from '../admin/CuentasPanel';
import AtrasadosPanel from '../admin/AtrasadosPanel';
import CobrosForm from '../repartidor/CobrosForm';
import type { CourierWeeklyGoals, Session } from '../types';

interface Props {
  session: Session;
  onLogout: () => void;
}

// El vendedor vende y cobra, pero no reparte: no tiene ruta, turno (ni GPS) ni pedido en calle.
type Section = 'home' | 'asistente' | 'ventas' | 'cotizaciones' | 'clientes' | 'catalogo' | 'stock' | 'cuentas' | 'cobros' | 'atrasados';

const TITLES: Record<Section, string> = {
  home: 'Inicio',
  asistente: 'Asistente IA',
  ventas: 'Ventas',
  cotizaciones: 'Cotizaciones',
  clientes: 'Clientes',
  catalogo: 'Catálogo',
  stock: 'Stock',
  cuentas: 'Cuentas corrientes',
  cobros: 'Cobros',
  atrasados: 'Atrasados',
};

const sections: SidebarSection[] = [
  {
    links: [
      { id: 'home', label: 'Inicio', icon: HomeIcon },
      { id: 'asistente', label: 'Asistente IA', icon: Sparkles },
    ],
  },
  {
    label: 'Ventas',
    links: [
      { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
      { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
      { id: 'cobros', label: 'Cobros', icon: Wallet },
      { id: 'cuentas', label: 'Cuentas corrientes', icon: Banknote },
      { id: 'atrasados', label: 'Atrasados', icon: AlertTriangle },
    ],
  },
  {
    label: 'Productos y clientes',
    links: [
      { id: 'catalogo', label: 'Catálogo', icon: Package },
      { id: 'stock', label: 'Stock', icon: Boxes },
      { id: 'clientes', label: 'Clientes', icon: UserCheck },
    ],
  },
];

function Inicio({ session, onNavigate }: { session: Session; onNavigate: (s: Section) => void }) {
  const [goals, setGoals] = useState<CourierWeeklyGoals[]>([]);
  useEffect(() => subscribeGoals(session.token, setGoals), [session.token]);
  const currentGoal = useMemo(() => goals[0]?.weeks.find((w) => w.state === 'actual'), [goals]);

  const shortcuts: { id: Section; label: string; icon: typeof ShoppingCart }[] = [
    { id: 'ventas', label: 'Cargar una venta', icon: ShoppingCart },
    { id: 'cobros', label: 'Registrar un cobro', icon: Wallet },
    { id: 'cotizaciones', label: 'Armar una cotización', icon: FileText },
    { id: 'stock', label: 'Ver stock y precios', icon: Boxes },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>Hola, {session.staff.name}</h1>
      {currentGoal && (
        <div style={{ maxWidth: 420 }}>
          <GoalProgressBar goal={currentGoal} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, maxWidth: 640 }}>
        {shortcuts.map(({ id, label, icon: Icon }) => (
          <button key={id} className="btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px 16px' }} onClick={() => onNavigate(id)}>
            <Icon size={16} color="#FE4806" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function VendedorShell({ session, onLogout }: Props) {
  const [section, setSection] = useState<Section>('home');

  return (
    <div className="app-shell">
      <AppSidebar
        brand="EL MANÁ"
        tagline="Panel de Vendedor"
        sections={sections}
        activeId={section}
        onNavigate={(id) => setSection(id as Section)}
        userLabel={session.staff.name}
        onLogout={onLogout}
      />
      <main className="app-main">
        <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
          {section !== 'home' && <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 20 }}>{TITLES[section]}</h1>}
          {section === 'home' && <Inicio session={session} onNavigate={setSection} />}
          {section === 'asistente' && <AsistentePanel session={session} />}
          {section === 'ventas' && <VentasPanel token={session.token} courier={{ id: session.staff.id, name: session.staff.name }} canDelete={false} />}
          {section === 'cotizaciones' && <CotizacionesPanel token={session.token} />}
          {section === 'clientes' && <ClientesPanel token={session.token} canDelete={false} />}
          {section === 'catalogo' && <CatalogoPanel token={session.token} canEdit={false} />}
          {section === 'stock' && <StockPanel token={session.token} readOnly />}
          {section === 'cuentas' && <CuentasPanel token={session.token} />}
          {section === 'cobros' && <CobrosForm session={session} />}
          {section === 'atrasados' && <AtrasadosPanel token={session.token} />}
        </div>
      </main>
    </div>
  );
}
