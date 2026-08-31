import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
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
import type { Session, StreetOrder } from '../types';

interface Props {
  session: Session;
  onLogout: () => void;
}

type Section = 'pedidos' | 'rutas' | 'planificacion' | 'mapa' | 'historial' | 'clientes' | 'catalogo' | 'equipo' | 'trackers' | 'cobros';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'pedidos', label: 'Pedidos en calle' },
  { id: 'rutas', label: 'Rutas del día' },
  { id: 'planificacion', label: 'Planificación' },
  { id: 'mapa', label: 'Mapa en vivo' },
  { id: 'historial', label: 'Historial' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'trackers', label: 'Trackers' },
  { id: 'cobros', label: 'Cobros' },
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Panel de mostrador</div>
            <div style={{ color: '#666', fontSize: 12 }}>{session.staff.name}</div>
          </div>
          <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        {section === 'pedidos' && (
          <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
            <button className={pedidosTab === 'activos' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setPedidosTab('activos')}>Activos</button>
            <button className={pedidosTab === 'historial' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setPedidosTab('historial')}>Historial</button>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, padding: '8px 20px' }}>{error}</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
        {section === 'pedidos' && (pedidosTab === 'activos'
          ? <PedidosCalleActivos session={session} orders={orders} onOrderChanged={refreshOrders} />
          : <PedidosCalleHistorial orders={orders} />)}
        {section === 'rutas' && <RutasPanel token={session.token} />}
        {section === 'planificacion' && <PlanificacionPanel token={session.token} />}
        {section === 'mapa' && <MapaVivo token={session.token} />}
        {section === 'historial' && <HistorialPanel token={session.token} />}
        {section === 'clientes' && <ClientesPanel token={session.token} canDelete />}
        {section === 'catalogo' && <CatalogoPanel token={session.token} canEdit />}
        {section === 'equipo' && <EquipoPanel token={session.token} />}
        {section === 'trackers' && <TrackersPanel token={session.token} />}
        {section === 'cobros' && <CobrosPanel token={session.token} />}
      </div>
    </div>
  );
}
