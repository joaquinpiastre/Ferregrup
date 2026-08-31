import type { AppData } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, Package, Users, ShoppingCart } from 'lucide-react';

interface Props { data: AppData; }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const COLORS = ['#FFE000', '#60a5fa', '#4ade80', '#fb923c', '#a78bfa', '#f472b6', '#34d399', '#f87171'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
        <div style={{ color: '#aaa', marginBottom: 2 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ color: p.color || '#FFE000', fontWeight: 600 }}>
            {typeof p.value === 'number' && p.value > 1000 ? fmt(p.value) : p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Reportes({ data }: Props) {
  // Category breakdown
  const catStock: Record<string, { qty: number; value: number }> = {};
  data.products.forEach(p => {
    if (!catStock[p.category]) catStock[p.category] = { qty: 0, value: 0 };
    catStock[p.category].qty += p.stock;
    catStock[p.category].value += p.stock * p.costPrice;
  });
  const catChartData = Object.entries(catStock).map(([name, d]) => ({ name, ...d }));

  // Debtor breakdown
  const totalOwed = data.debtors.reduce((s, d) => s + (d.totalDebt - d.amountPaid), 0);
  const debtorPieData = data.debtors.filter(d => d.status !== 'pagado').map(d => ({
    name: d.name, value: d.totalDebt - d.amountPaid,
  })).sort((a, b) => b.value - a.value).slice(0, 6);

  // Orders by supplier
  const supplierOrders: Record<string, number> = {};
  data.orders.forEach(o => { supplierOrders[o.supplier] = (supplierOrders[o.supplier] || 0) + o.total; });
  const supplierData = Object.entries(supplierOrders).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // KPIs
  const margin = data.products.reduce((s, p) => s + p.stock * (p.salePrice - p.costPrice), 0);
  const totalCost = data.products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const marginPct = totalCost > 0 ? (margin / totalCost) * 100 : 0;
  const receivedOrdersTotal = data.orders.filter(o => o.status === 'recibido').reduce((s, o) => s + o.total, 0);

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Reportes</h1>
        <p style={{ color: '#666', fontSize: 14 }}>Análisis y estadísticas del negocio</p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KPICard icon={<Package size={20} color="#FFE000" />} label="Margen potencial" value={fmt(margin)} sub={`${marginPct.toFixed(1)}% sobre costo`} color="#FFE000" />
        <KPICard icon={<TrendingUp size={20} color="#4ade80" />} label="Compras realizadas" value={fmt(receivedOrdersTotal)} sub={`${data.orders.filter(o => o.status === 'recibido').length} pedidos`} color="#4ade80" />
        <KPICard icon={<Users size={20} color="#f87171" />} label="Deuda total activa" value={fmt(totalOwed)} sub={`${data.debtors.filter(d => d.status !== 'pagado').length} clientes`} color="#f87171" />
        <KPICard icon={<ShoppingCart size={20} color="#60a5fa" />} label="Pedidos en curso" value={String(data.orders.filter(o => o.status === 'pendiente' || o.status === 'en_camino').length)} sub="pendiente + en camino" color="#60a5fa" />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Stock por Categoría</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Valor de costo en inventario</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={catChartData}>
              <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {catChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Deuda por Cliente</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Distribución de deuda pendiente</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={debtorPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {debtorPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(val) => <span style={{ fontSize: 11, color: '#888' }}>{val}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Top suppliers */}
        <div className="card">
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Compras por Proveedor</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Total histórico de pedidos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {supplierData.map((s, i) => {
              const max = supplierData[0]?.value || 1;
              const pct = (s.value / max) * 100;
              return (
                <div key={s.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#ccc' }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{fmt(s.value)}</span>
                  </div>
                  <div style={{ height: 4, background: '#2d2d2d', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Product top table */}
        <div className="card">
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Productos por Valor</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Top productos por valor de inventario</div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {[...data.products].sort((a, b) => (b.stock * b.costPrice) - (a.stock * a.costPrice)).slice(0, 6).map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontSize: 12, color: '#ddd', fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#555' }}>{p.brand}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 13, color: '#aaa' }}>{p.stock} {p.unit}</td>
                  <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#FFE000' }}>{fmt(p.stock * p.costPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: '#1a1a1a', border: `1px solid ${color}22`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ padding: 6, background: `${color}15`, borderRadius: 7 }}>{icon}</div>
        <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#555' }}>{sub}</div>
    </div>
  );
}
