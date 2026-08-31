import { LogOut, MapPin, Send, Users, Package, Wallet, Play, Square } from 'lucide-react';
import type { RouteStop, Shift } from '../types';

interface Props {
  courierName: string;
  shift: Shift | null;
  stops: RouteStop[];
  onStart: () => void;
  onEnd: () => void;
  onNavigate: (section: 'ruta' | 'pedido' | 'clientes' | 'catalogo' | 'cobros') => void;
  onLogout: () => void;
}

export default function Home({ courierName, shift, stops, onStart, onEnd, onNavigate, onLogout }: Props) {
  const completed = stops.filter((s) => s.status === 'entregado').length;
  const pending = stops.length - completed;

  const tiles: { id: 'ruta' | 'pedido' | 'clientes' | 'catalogo' | 'cobros'; label: string; icon: typeof MapPin }[] = [
    { id: 'ruta', label: 'Mi ruta', icon: MapPin },
    { id: 'pedido', label: 'Pedido en calle', icon: Send },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'catalogo', label: 'Catálogo', icon: Package },
    { id: 'cobros', label: 'Cobros', icon: Wallet },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Hola, {courierName}</h1>
      </div>

      {shift ? (
        <div className="card" style={{ borderColor: '#4ade8033' }}>
          <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Turno activo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{completed}/{stops.length}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Entregados</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{pending}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Pendientes</div>
            </div>
          </div>
          <button className="btn-danger" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={onEnd}>
            <Square size={14} /> Terminar turno
          </button>
        </div>
      ) : (
        <div className="card">
          <div style={{ color: '#888', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Turno no iniciado</div>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>{stops.length} parada{stops.length !== 1 ? 's' : ''} asignada{stops.length !== 1 ? 's' : ''} para hoy.</p>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onStart}>
            <Play size={14} /> Iniciar turno
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {tiles.map(({ id, label, icon: Icon }) => (
          <button key={id} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 20, cursor: 'pointer', border: 'none' }} onClick={() => onNavigate(id)}>
            <Icon size={22} color="#FFE000" />
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>

      <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={onLogout}>
        <LogOut size={14} /> Cerrar sesión
      </button>
    </div>
  );
}
