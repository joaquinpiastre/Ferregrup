import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Building2, User } from 'lucide-react';
import { createClient, deleteClient, fetchClientAccounts, fetchClients, subscribeClients, updateClient } from '../api';
import type { ClientAccount, FieldClient, FieldClientType } from '../types';

interface Props {
  token: string;
  canDelete: boolean;
}

type Filter = 'todos' | FieldClientType;

const emptyForm = () => ({ name: '', address: '', phone: '', notes: '', type: 'cliente' as FieldClientType });
const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function ClientesPanel({ token, canDelete }: Props) {
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FieldClient | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');

  useEffect(() => subscribeClients(token, setClients), [token]);

  useEffect(() => {
    let cancelled = false;
    fetchClientAccounts(token)
      .then((accounts: ClientAccount[]) => { if (!cancelled) setBalances(new Map(accounts.map((a) => [a.id, a.balance]))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, clients.length]);

  function refresh() {
    fetchClients(token).then(setClients).catch(() => {});
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => filter === 'todos' || c.type === filter)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, filter, search]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    setError('');
  }

  function openEdit(c: FieldClient) {
    setEditing(c);
    setForm({ name: c.name, address: c.address, phone: c.phone ?? '', notes: c.notes ?? '', type: c.type });
    setShowForm(true);
    setError('');
  }

  async function save() {
    if (!form.name.trim() || !form.address.trim()) {
      setError('Nombre y dirección son obligatorios.');
      return;
    }
    try {
      if (editing) {
        await updateClient(token, editing.id, form);
      } else {
        const id = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await createClient(token, { id, ...form });
      }
      setShowForm(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  async function remove(c: FieldClient) {
    if (!confirm(`¿Eliminar a ${c.name}?`)) return;
    await deleteClient(token, c.id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color="#666" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input-field" style={{ paddingLeft: 32 }} placeholder="Buscar por nombre, dirección o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-field" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="todos">Todos ({clients.length})</option>
          <option value="cliente">Clientes ({clients.filter((c) => c.type === 'cliente').length})</option>
          <option value="taller">Talleres ({clients.filter((c) => c.type === 'taller').length})</option>
        </select>
        <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Nuevo</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Nombre *</label>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Dirección *</label>
              <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label>Teléfono</label>
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label>Tipo</label>
              <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FieldClientType })}>
                <option value="cliente">Cliente</option>
                <option value="taller">Taller</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notas / pedido habitual</label>
              <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>{editing ? 'Guardar cambios' : 'Crear'}</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No hay clientes que coincidan.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {c.type === 'taller' ? <Building2 size={16} color="#FFE000" /> : <User size={16} color="#60a5fa" />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>{c.address}{c.phone ? ` · ${c.phone}` : ''}</div>
                  {c.notes && <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>{c.notes}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {balances.has(c.id) && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: balances.get(c.id)! > 0 ? '#f87171' : balances.get(c.id)! < 0 ? '#4ade80' : '#666' }}>
                      {fmt(balances.get(c.id)!)}
                    </div>
                    <div style={{ fontSize: 10, color: '#666' }}>{balances.get(c.id)! > 0 ? 'debe' : balances.get(c.id)! < 0 ? 'a favor' : 'al día'}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => openEdit(c)}><Edit2 size={13} /></button>
                  {canDelete && (
                    <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => remove(c)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
