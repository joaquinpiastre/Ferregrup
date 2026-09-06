import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Target } from 'lucide-react';
import { deleteGoal, fetchStaffList, setGoal, subscribeGoals } from '../api';
import GoalProgressBar from '../shared/GoalProgressBar';
import type { CourierGoal, GoalMetric, GoalPeriod, Staff } from '../types';

interface Props {
  token: string;
}

function mondayOf(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ObjetivosPanel({ token }: Props) {
  const [goals, setGoals] = useState<CourierGoal[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [courierId, setCourierId] = useState('');
  const [periodType, setPeriodType] = useState<GoalPeriod>('semanal');
  const [periodStart, setPeriodStart] = useState(mondayOf(new Date()));
  const [targetAmount, setTargetAmount] = useState('');
  const [metric, setMetric] = useState<GoalMetric>('ambos');
  const [error, setError] = useState('');

  useEffect(() => subscribeGoals(token, setGoals), [token]);
  useEffect(() => { fetchStaffList(token).then(setStaff).catch(() => {}); }, [token]);

  const couriers = useMemo(() => staff.filter((s) => s.role === 'repartidor'), [staff]);

  const grouped = useMemo(() => {
    const map = new Map<string, CourierGoal[]>();
    for (const g of goals) {
      if (!map.has(g.courierId)) map.set(g.courierId, []);
      map.get(g.courierId)!.push(g);
    }
    return Array.from(map.entries());
  }, [goals]);

  function openAdd() {
    setCourierId('');
    setPeriodType('semanal');
    setPeriodStart(mondayOf(new Date()));
    setTargetAmount('');
    setMetric('ambos');
    setError('');
    setShowForm(true);
  }

  function onPeriodTypeChange(pt: GoalPeriod) {
    setPeriodType(pt);
    setPeriodStart(pt === 'semanal' ? mondayOf(new Date()) : firstOfMonth(new Date()));
  }

  async function submit() {
    const courier = couriers.find((c) => c.id === courierId);
    const value = Number(targetAmount.replace(',', '.'));
    if (!courier) { setError('Elegí un repartidor.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Ingresá un monto de objetivo válido.'); return; }
    try {
      await setGoal(token, { courierId: courier.id, courierName: courier.name, periodType, periodStart, targetAmount: value, metric });
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el objetivo.');
    }
  }

  async function remove(g: CourierGoal) {
    if (!confirm(`¿Eliminar el objetivo ${g.periodType} de ${g.courierName}?`)) return;
    await deleteGoal(token, g.id);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Nuevo objetivo</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Repartidor</label>
              <select className="input-field" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                <option value="">Elegir...</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label>Período</label>
              <select className="input-field" value={periodType} onChange={(e) => onPeriodTypeChange(e.target.value as GoalPeriod)}>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label>{periodType === 'semanal' ? 'Lunes de inicio' : 'Mes (día 1)'}</label>
              <input className="input-field" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <label>Monto objetivo</label>
              <input className="input-field" inputMode="decimal" placeholder="0" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Cuenta para el objetivo</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={metric === 'ambos' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setMetric('ambos')}>Cobrado + Vendido</button>
                <button className={metric === 'cobros' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setMetric('cobros')}>Solo cobrado</button>
                <button className={metric === 'ventas' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setMetric('ventas')}>Solo vendido</button>
              </div>
            </div>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={submit}>Guardar objetivo</button>
          </div>
        </div>
      )}

      {grouped.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>Todavía no hay objetivos definidos.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([cid, list]) => (
            <div key={cid}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Target size={15} color="#FFE000" />
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{list[0].courierName}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {list.map((g) => (
                  <div key={g.id} style={{ position: 'relative' }}>
                    <GoalProgressBar goal={g} />
                    <button
                      className="btn-danger"
                      style={{ position: 'absolute', top: 10, right: 10, padding: '3px 6px' }}
                      onClick={() => remove(g)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
