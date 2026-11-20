import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, navigate } from './tienda/router';
import { apiEnabled, loadSession, saveSession } from './reparto/api';
import type { Session } from './reparto/types';
import './index.css';

// Cada parte se descarga recién cuando se usa: quien entra a la tienda no baja el código del panel
// (mapas, gráficos, PDF) y el repartidor que abre el panel no baja la tienda.
const TiendaApp = lazy(() => import('./tienda/TiendaApp'));
const LoginScreen = lazy(() => import('./reparto/LoginScreen'));
const AdminShell = lazy(() => import('./reparto/admin/AdminShell'));
const RepartidorShell = lazy(() => import('./reparto/repartidor/RepartidorShell'));
const VendedorShell = lazy(() => import('./reparto/vendedor/VendedorShell'));

// El sitio público es la tienda online y el sistema de gestión vive en /panel. Quien ya tiene la
// sesión del panel abierta y abre la raíz va directo al panel (así los repartidores siguen entrando
// como siempre); solo pasa al abrir la página, no al navegar dentro de la tienda.
if (window.location.pathname === '/' && loadSession()) window.history.replaceState(null, '', '/panel');

export default function App() {
  const { path } = useLocation();
  const [session, setSession] = useState<Session | null>(() => loadSession());

  if (path === '/panel' || path.startsWith('/panel/')) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#111' }} />}>
        <Panel session={session} setSession={setSession} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f4efe8' }} />}>
      <TiendaApp />
    </Suspense>
  );
}

function Panel({ session, setSession }: { session: Session | null; setSession: (s: Session | null) => void }) {
  useEffect(() => {
    document.title = 'El Maná — Sistema de Gestión';
  }, []);

  function handleLogout() {
    saveSession(null);
    setSession(null);
    navigate('/');
  }

  if (!apiEnabled()) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111', padding: 32 }}>
        <div className="card" style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Falta configuración</h1>
          <p style={{ color: '#888', fontSize: 14 }}>
            El Maná necesita un backend para el login y la sincronización entre dispositivos. Configurá la variable
            <code style={{ margin: '0 4px' }}>VITE_API_URL</code> apuntando al servidor (carpeta <code>server/</code>).
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onLogin={(s) => {
          saveSession(s);
          setSession(s);
        }}
        onBack={() => navigate('/')}
      />
    );
  }

  if (session.staff.role === 'admin') return <AdminShell session={session} onLogout={handleLogout} />;
  if (session.staff.role === 'vendedor') return <VendedorShell session={session} onLogout={handleLogout} />;
  return <RepartidorShell session={session} onLogout={handleLogout} />;
}
