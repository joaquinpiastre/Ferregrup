import { useState } from 'react';
import LoginScreen from './reparto/LoginScreen';
import AdminShell from './reparto/admin/AdminShell';
import RepartidorShell from './reparto/repartidor/RepartidorShell';
import { apiEnabled, loadSession, saveSession } from './reparto/api';
import type { Session } from './reparto/types';
import './index.css';

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

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

  return <RepartidorShell session={session} onLogout={handleLogout} />;
}
