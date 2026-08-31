import { useEffect, useState } from 'react';
import { LogIn, Truck, Store, ShieldCheck } from 'lucide-react';
import { fetchStaffList, login } from './api';
import type { Session, Staff } from './types';

interface Props {
  title?: string;
  subtitle?: string;
  onLogin: (session: Session) => void;
}

const ROLE_LABEL: Record<Staff['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Mostrador',
  repartidor: 'Repartidor',
};

export default function LoginScreen({ title = 'Ferregrup', subtitle = 'Iniciá sesión para continuar', onLogin }: Props) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStaffList()
      .then((list) => {
        setStaff(list);
        setSelectedId((prev) => prev || list[0]?.id || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la lista de usuarios.'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!selectedId || pin.length !== 4) {
      setError('Elegí tu usuario e ingresá el PIN de 4 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const session = await login(selectedId, pin);
      onLogin(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: 24 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{title}</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>{subtitle}</p>

        <label>Usuario</label>
        <select className="input-field" style={{ marginBottom: 14 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {ROLE_LABEL[s.role]}
            </option>
          ))}
        </select>

        <label>PIN</label>
        <input
          className="input-field"
          style={{ marginBottom: 16, letterSpacing: 4, textAlign: 'center', fontSize: 20 }}
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="••••"
        />

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <button className="btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          <LogIn size={16} /> {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div style={{ display: 'flex', gap: 16, marginTop: 20, justifyContent: 'center', color: '#555', fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ShieldCheck size={13} /> Superadmin</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Store size={13} /> Mostrador</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Truck size={13} /> Repartidor</span>
        </div>
      </form>
    </div>
  );
}
