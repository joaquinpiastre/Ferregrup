import { Package, Users, ShoppingCart, AlertTriangle, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { AppData } from '../types';
import { isOverdue } from '../store';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';

interface Props { data: AppData; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const stockTrend = [
  { mes: 'Ago', valor: 320000 }, { mes: 'Sep', valor: 285000 }, { mes: 'Oct', valor: 410000 },
  { mes: 'Nov', valor: 390000 }, { mes: 'Dic', valor: 450000 }, { mes: 'Ene', valor: 520000 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
        <div style={{ color: '#aaa', marginBottom: 2 }}>{label}</div>
        <div style={{ color: '#FFE000', fontWeight: 600 }}>{fmt(payload[0].value)}</div>
      </div>
    );
  }
  return null;
};

export default function Dashboard({ data }: Props) {
  const lowStock = data.products.filter(p => p.stock <= p.minStock);
  const activeDebtors = data.debtors.filter(d => d.status !== 'pagado');
  const totalDebt = activeDebtors.reduce((s, d) => s + (d.totalDebt - d.amountPaid), 0);
  const pendingOrders = data.orders.filter(o => o.status === 'pendiente' || o.status === 'en_camino');
  const stockValue = data.products.reduce((s, p) => s + p.stock * p.costPrice, 0);

  const categoryCounts: Record<string, number> = {};
  data.products.forEach(p => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + p.stock * p.costPrice;
  });
  const catData = Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));

  const orderStatusMap: Record<string, { label: string; color: string; icon: any }> = {
    pendiente: { label: 'Pendiente', color: '#FFE000', icon: Clock },
    en_camino: { label: 'En camino', color: '#60a5fa', icon: TrendingUp },
    recibido: { label: 'Recibido', color: '#4ade80', icon: CheckCircle },
    cancelado: { label: 'Cancelado', color: '#f87171', icon: XCircle },
  };

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: '#666', fontSize: 14 }}>Resumen general del negocio</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard
          icon={<Package size={22} color="#FFE000" />}
          label="Valor del Stock"
          value={fmt(stockValue)}
          sub={`${data.products.length} productos`}
          accent="#FFE000"
        />
        <StatCard
          icon={<Users size={22} color="#f87171" />}
          label="Deuda Pendiente"
          value={fmt(totalDebt)}
          sub={`${activeDebtors.length} deudores activos`}
          accent="#f87171"
        />
        <StatCard
          icon={<ShoppingCart size={22} color="#60a5fa" />}
          label="Pedidos Activos"
          value={String(pendingOrders.length)}
          sub={`de ${data.orders.length} totales`}
          accent="#60a5fa"
        />
        <StatCard
          icon={<AlertTriangle size={22} color="#fb923c" />}
          label="Stock Bajo"
          value={String(lowStock.length)}
          sub="productos bajo mínimo"
          accent="#fb923c"
        />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Trend chart */}
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Evolución del Stock</div>
            <div style={{ color: '#666', fontSize: 12 }}>Valor estimado últimos 6 meses</div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={stockTrend}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFE000" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#FFE000" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="mes" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="valor" stroke="#FFE000" strokeWidth={2} fill="url(#grad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Category bars */}
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Stock por Categoría</div>
            <div style={{ color: '#666', fontSize: 12 }}>Valor en pesos por rubro</div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={catData} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={4}>
                {catData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#FFE000' : `hsl(${45 + i * 30}, 80%, ${50 - i * 5}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Low Stock Alert */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={16} color="#fb923c" />
            <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Productos con Stock Bajo</span>
            {lowStock.length > 0 && (
              <span className="badge badge-orange" style={{ marginLeft: 'auto' }}>{lowStock.length}</span>
            )}
          </div>
          {lowStock.length === 0 ? (
            <div style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              ✓ Todos los productos tienen stock suficiente
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lowStock.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#111', borderRadius: 8, border: '1px solid #2d1800' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: '#fff' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{p.category} · {p.brand}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: p.stock === 0 ? '#f87171' : '#fb923c' }}>{p.stock}</div>
                    <div style={{ fontSize: 10, color: '#666' }}>mín: {p.minStock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <ShoppingCart size={16} color="#60a5fa" />
            <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Pedidos Recientes</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.orders.slice(0, 4).map(o => {
              const s = orderStatusMap[o.status];
              const Icon = s.icon;
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#111', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={16} color={s.color} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#fff' }}>{o.supplier}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>{o.orderDate}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{fmt(o.total)}</div>
                    <div style={{ fontSize: 11, color: s.color }}>{s.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upcoming Payments */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Clock size={16} color="#FFE000" />
          <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Cobros Pendientes</span>
          {data.debtors.filter(d => d.status !== 'pagado' && isOverdue(d.nextPaymentDate)).length > 0 && (
            <span className="badge badge-orange" style={{ marginLeft: 'auto' }}>
              {data.debtors.filter(d => d.status !== 'pagado' && isOverdue(d.nextPaymentDate)).length} vencidas
            </span>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Frecuencia</th>
              <th>Cuota</th>
              <th>Próximo cobro</th>
              <th>Deuda restante</th>
            </tr>
          </thead>
          <tbody>
            {data.debtors
              .filter(d => d.status !== 'pagado')
              .sort((a, b) => {
                const ao = isOverdue(a.nextPaymentDate) ? 0 : 1;
                const bo = isOverdue(b.nextPaymentDate) ? 0 : 1;
                return ao - bo;
              })
              .map(d => {
                const overdue = isOverdue(d.nextPaymentDate);
                return (
                  <tr key={d.id} style={{ background: overdue ? '#1a0e00' : undefined }}>
                    <td>
                      <div style={{ fontWeight: 500, color: '#fff' }}>{d.name}</div>
                      {d.company && <div style={{ fontSize: 11, color: '#666' }}>{d.company}</div>}
                    </td>
                    <td><span className={`badge ${d.type === 'empresa' ? 'badge-blue' : 'badge-gray'}`}>{d.type === 'empresa' ? 'Empresa' : 'Persona'}</span></td>
                    <td><span className={`badge ${d.paymentFrequency === 'semanal' ? 'badge-yellow' : 'badge-green'}`}>{d.paymentFrequency}</span></td>
                    <td style={{ fontWeight: 600, color: '#FFE000' }}>{d.installmentAmount > 0 ? fmt(d.installmentAmount) : '—'}</td>
                    <td>
                      <span style={{ color: overdue ? '#fb923c' : '#aaa', fontWeight: overdue ? 700 : 400 }}>
                        {overdue && '⚠ '}{d.nextPaymentDate}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#f87171' }}>{fmt(d.totalDebt - d.amountPaid)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ padding: 8, background: `${accent}15`, borderRadius: 8 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#aaa', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#555' }}>{sub}</div>
    </div>
  );
}
