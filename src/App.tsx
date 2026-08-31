import { useState, useEffect } from 'react';
import type { AppData } from './types';
import { loadData, saveData } from './store';
import Sidebar from './components/Sidebar';
import type { Page } from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Inventario from './pages/Inventario';
import Deudores from './pages/Deudores';
import Pedidos from './pages/Pedidos';
import Reportes from './pages/Reportes';
import Clientes from './pages/Clientes';
import Ventas from './pages/Ventas';
import Rutas from './pages/Rutas';
import LoginScreen from './reparto/LoginScreen';
import AdminShell from './reparto/admin/AdminShell';
import RepartidorShell from './reparto/repartidor/RepartidorShell';
import EquipoPanel from './reparto/admin/EquipoPanel';
import { apiEnabled, loadSession, saveSession } from './reparto/api';
import type { Session } from './reparto/types';
import './index.css';

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [page, setPage] = useState<Page>('dashboard');
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => {
    saveData(data);
  }, [data]);

  function handleLogout() {
    saveSession(null);
    setSession(null);
  }

  if (!apiEnabled()) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111', padding: 32 }}>
        <div className="card" style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Falta configuración</h1>
          <p style={{ color: '#888', fontSize: 14 }}>
            Ferregrup necesita un backend para el login y la sincronización entre dispositivos. Configurá la variable
            <code style={{ margin: '0 4px' }}>VITE_API_URL</code> apuntando al servidor (carpeta <code>server/</code>).
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={(s) => { saveSession(s); setSession(s); }} />;
  }

  if (session.staff.role === 'admin') {
    return <AdminShell session={session} onLogout={handleLogout} />;
  }

  if (session.staff.role === 'repartidor') {
    return <RepartidorShell session={session} onLogout={handleLogout} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard data={data} />;
      case 'inventario': return <Inventario data={data} onChange={setData} />;
      case 'deudores':   return <Deudores data={data} onChange={setData} />;
      case 'pedidos':    return <Pedidos data={data} onChange={setData} />;
      case 'reportes':   return <Reportes data={data} />;
      case 'clientes':   return <Clientes data={data} onChange={setData} />;
      case 'ventas':     return <Ventas data={data} onChange={setData} />;
      case 'rutas':      return <Rutas data={data} onChange={setData} />;
      case 'usuarios':   return (
        <div style={{ padding: '28px 32px' }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Usuarios</h1>
            <p style={{ color: '#666', fontSize: 14 }}>Altas y roles de todo el sistema: superadmin, mostrador y repartidor.</p>
          </div>
          <EquipoPanel token={session.token} currentUserId={session.staff.id} canManageSuperadmin />
        </div>
      );
    }
  };

  return (
    <div className="app-shell">
      <Sidebar currentPage={page} onNavigate={setPage} staffName={session.staff.name} onLogout={handleLogout} />
      <main className="app-main">
        {renderPage()}
      </main>
    </div>
  );
}
