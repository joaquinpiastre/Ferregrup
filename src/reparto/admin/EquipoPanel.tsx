import { useEffect, useState } from 'react';
import { Plus, Truck, Store, Edit2 } from 'lucide-react';
import { createTeamMember, fetchTeam, updateTeamMember } from '../api';
import type { TeamMember } from '../types';

interface Props {
  token: string;
}

const emptyForm = () => ({ id: '', name: '', pin: '', role: 'repartidor' as 'admin' | 'repartidor' });

export default function EquipoPanel({ token }: Props) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');

  function refresh() {
    fetchTeam(token).then(setTeam).catch(() => {});
  }

  useEffect(refresh, [token]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    setError('');
  }

  function openEdit(m: TeamMember) {
    setEditing(m);
    setForm({ id: m.id, name: m.name, pin: '', role: m.role });
    setShowForm(true);
    setError('');
  }

  async function save() {
    try {
      if (editing) {
        await updateTeamMember(token, editing.id, { name: form.name, pin: form.pin || undefined });
      } else {
        if (!form.id.trim() || !form.name.trim() || !/^\d{4}$/.test(form.pin)) {
          setError('Completá usuario, nombre y un PIN de 4 dígitos.');
          return;
        }
        await createTeamMember(token, { id: form.id.trim(), name: form.name.trim(), pin: form.pin, role: form.role });
      }
      setShowForm(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  async function toggleActive(m: TeamMember) {
    await updateTeamMember(token, m.id, { active: !m.active });
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Nuevo usuario</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {!editing && (
              <div>
                <label>Usuario (para el login)</label>
                <input className="input-field" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="ej: juan" />
              </div>
            )}
            <div>
              <label>Nombre</label>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>PIN {editing ? '(dejar vacío para no cambiarlo)' : ''}</label>
              <input className="input-field" inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </div>
            {!editing && (
              <div>
                <label>Rol</label>
                <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'repartidor' })}>
                  <option value="repartidor">Repartidor</option>
                  <option value="admin">Mostrador</option>
                </select>
              </div>
            )}
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>{editing ? 'Guardar cambios' : 'Crear'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {team.map((m) => (
          <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, opacity: m.active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {m.role === 'repartidor' ? <Truck size={16} color="#FFE000" /> : <Store size={16} color="#60a5fa" />}
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>@{m.id} · {m.role === 'repartidor' ? 'Repartidor' : 'Mostrador'}{!m.active ? ' · Inactivo' : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => openEdit(m)}><Edit2 size={13} /></button>
              <button className={m.active ? 'btn-danger' : 'btn-primary'} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => toggleActive(m)}>
                {m.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
