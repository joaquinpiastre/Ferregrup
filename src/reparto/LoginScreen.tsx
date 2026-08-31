import { useState } from 'react';
import { LogIn, Wrench } from 'lucide-react';
import { login } from './api';
import type { Session } from './types';

interface Props {
  title?: string;
  subtitle?: string;
  onLogin: (session: Session) => void;
}

export default function LoginScreen({ title = 'Ferregrup', subtitle = 'Iniciá sesión para continuar', onLogin }: Props) {
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!id.trim() || pin.length !== 4) {
      setError('Ingresá tu usuario y el PIN de 4 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const session = await login(id.trim(), pin);
      onLogin(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, background: 'radial-gradient(circle at 50% 0%, #1a1a1a 0%, #0a0a0a 60%)' }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 380, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, background: '#FFE000', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Wrench size={26} color="#000" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>{title}</h1>
          <p style={{ color: '#777', fontSize: 13, marginTop: 4 }}>{subtitle}</p>
        </div>

        <label>Usuario</label>
        <input
          className="input-field"
          style={{ marginBottom: 16 }}
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="tu usuario"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
        />

        <label>PIN</label>
        <input
          className="input-field"
          style={{ marginBottom: 20, letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="••••"
        />

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</div>}

        <button className="btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} disabled={loading}>
          <LogIn size={16} /> {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
