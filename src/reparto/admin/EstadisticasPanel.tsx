import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { fetchStats } from '../api';
import type { Stats } from '../types';

interface Props {
  token: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const REFRESH_MS = 30000;

export default function EstadisticasPanel({ token }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchStats(token).then((s) => { if (!cancelled) setStats(s); }).catch(() => {});
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  if (!stats) {
    return <p style={{ color: '#666', fontSize: 14 }}>Cargando estadísticas...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 13 }}>
        <TrendingUp size={15} color="#FFE000" />
        Proyección estimada según el ritmo de cobro de las últimas 4 semanas — se recalcula sola con cada cobro y venta nuevos.
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Semana que viene
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          <div className="card">
            <div style={{ fontSize: 24, fontWeight: 700, color: '#FFE000' }}>{fmt(stats.semana.proyeccionCobros)}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Proyección de cobros</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(stats.semana.actualCobros)}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Cobrado esta semana</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(stats.semana.proyeccionVentas)}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Proyección de ventas</div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Mes que viene
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          <div className="card">
            <div style={{ fontSize: 24, fontWeight: 700, color: '#FFE000' }}>{fmt(stats.mes.proyeccionCobros)}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Proyección de cobros</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(stats.mes.actualCobros)}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Cobrado este mes</div>
          </div>
          <div className="stat-card">
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(stats.mes.proyeccionVentas)}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Proyección de ventas</div>
          </div>
        </div>
      </div>

      <div style={{ color: '#555', fontSize: 12 }}>
        Promedio diario: {fmt(stats.avgDailyCobros)} cobrado, {fmt(stats.avgDailyVentas)} vendido.
      </div>
    </div>
  );
}
