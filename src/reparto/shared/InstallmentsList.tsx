import type { SaleInstallment } from '../types';

interface Props {
  installments: SaleInstallment[];
  total: number;
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function fmtDueDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function installmentStatus(inst: SaleInstallment): { label: string; color: string } {
  if (inst.paid >= inst.amount) return { label: 'Pagada', color: '#4ade80' };
  if (inst.paid > 0) return { label: 'Parcial', color: '#FFE000' };
  if (inst.dueDate && inst.dueDate < new Date().toISOString().slice(0, 10)) return { label: 'Vencida', color: '#f87171' };
  return { label: 'Pendiente', color: '#888' };
}

export default function InstallmentsList({ installments, total }: Props) {
  if (installments.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Plan de pago ({installments.length} cuotas)
      </div>
      {installments.map((inst) => {
        const status = installmentStatus(inst);
        const remaining = Math.max(0, inst.amount - inst.paid);
        return (
          <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ color: '#ccc', minWidth: 70 }}>
              {inst.number}/{total}
            </span>
            {inst.dueDate && <span style={{ color: '#666', minWidth: 76 }}>vence {fmtDueDate(inst.dueDate)}</span>}
            <span style={{ color: '#fff', flex: 1 }}>{fmt(inst.amount)}</span>
            {status.label === 'Parcial' && <span style={{ color: '#666', fontSize: 12 }}>debe {fmt(remaining)}</span>}
            <span className="badge" style={{ background: `${status.color}22`, color: status.color, border: `1px solid ${status.color}55` }}>
              {status.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
