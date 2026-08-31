import { LayoutDashboard, Package, Users, ShoppingCart, BarChart2, UserCheck, FileText, MapPin, UserCog } from 'lucide-react';
import AppSidebar from './AppSidebar';
import type { SidebarSection } from './AppSidebar';

export type Page = 'dashboard' | 'inventario' | 'deudores' | 'pedidos' | 'reportes' | 'clientes' | 'ventas' | 'rutas' | 'usuarios';

interface Props {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  staffName: string;
  onLogout: () => void;
}

const sections: SidebarSection[] = [
  {
    label: 'Distribución',
    links: [
      { id: 'clientes', label: 'Clientes', icon: UserCheck },
      { id: 'ventas',   label: 'Ventas / Remitos', icon: FileText },
      { id: 'rutas',    label: 'Rutas', icon: MapPin },
    ],
  },
  {
    label: 'Stock',
    links: [
      { id: 'inventario', label: 'Inventario', icon: Package },
      { id: 'pedidos',    label: 'Pedidos', icon: ShoppingCart },
    ],
  },
  {
    label: 'Finanzas',
    links: [
      { id: 'deudores', label: 'Deudores', icon: Users },
    ],
  },
  {
    label: 'Análisis',
    links: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'reportes',  label: 'Reportes', icon: BarChart2 },
    ],
  },
  {
    label: 'Sistema',
    links: [
      { id: 'usuarios', label: 'Usuarios', icon: UserCog },
    ],
  },
];

export default function Sidebar({ currentPage, onNavigate, staffName, onLogout }: Props) {
  return (
    <AppSidebar
      sections={sections}
      activeId={currentPage}
      onNavigate={(id) => onNavigate(id as Page)}
      userLabel={staffName}
      onLogout={onLogout}
    />
  );
}
