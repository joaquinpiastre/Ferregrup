import { useEffect, useMemo, useState } from 'react';
import { ScrollText, LogIn, UserCog, Banknote, ShoppingCart, Target, Truck, Package, Building2 } from 'lucide-react';
import { fetchStaffList, subscribeLogs } from '../api';
import type { ActivityLogEntry, Staff } from '../types';

interface Props {
  token: string;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const ACTION_ICON: Record<string, typeof LogIn> = {
  'auth.login': LogIn,
  'team.create': UserCog,
  'team.update': UserCog,
  'payment.create': Banknote,
  'sale.create': ShoppingCart,
  'sale.delete': ShoppingCart,
  'goal.set': Target,
  'goal.delete': Target,
  'client.create': UserCog,
  'client.update': UserCog,
  'client.delete': UserCog,
  'route_stop.status': Truck,
  'street_order.status': Package,
  'supplier.create': Building2,
  'supplier.delete': Building2,
  'supplier_debt.create': Building2,
  'supplier_debt.pay': Building2,
  'supplier_debt.delete': Building2,
};

export default function LogsPanel({ token }: Props) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffFilter, setStaffFilter] = useState('todos');

  useEffect(() => subscribeLogs(token, staffFilter === 'todos' ? undefined : staffFilter, setLogs), [token, staffFilter]);
  useEffect(() => { fetchStaffList(token).then(setStaff).catch(() => {}); }, [token]);

  const names = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <ScrollText size={18} color="#FFE000" />
        <select className="input-field" style={{ width: 220 }} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="todos">Todos los usuarios</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{names.get(s.id) ?? s.id}</option>)}
        </select>
      </div>

      {logs.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>Sin actividad registrada todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logs.map((l) => {
            const Icon = ACTION_ICON[l.action] ?? ScrollText;
            return (
              <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12 }}>
                <Icon size={15} color="#888" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13 }}>{l.summary}</div>
                  <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                    {l.staffName} ({l.staffRole}) · {fmtDate(l.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
