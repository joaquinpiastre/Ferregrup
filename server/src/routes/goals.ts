import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { addDays, arToday, loadInstallments, mondayOf, paidUntil, type InstallmentRow } from '../collections.js';

export const goalsRouter = Router();

const UPCOMING_WEEKS = 4;
const round2 = (n: number) => Math.round(n * 100) / 100;

// El objetivo de un repartidor ya no se carga a mano: en cada semana es lo que le toca cobrar
// de las cuotas de sus ventas — las que vencen esa semana más lo que arrastra sin cobrar de
// semanas anteriores. Lo cobrado es lo aplicado a esas cuotas durante la semana.
function weeksForCourier(installments: InstallmentRow[], today: string) {
  const thisWeek = mondayOf(today);
  const dueWeeks = installments.map((i) => mondayOf(i.dueDate)).sort();
  const first = dueWeeks[0];
  const last = [dueWeeks[dueWeeks.length - 1], thisWeek].sort().pop()!;
  const lastShown = last < addDays(thisWeek, UPCOMING_WEEKS * 7) ? last : addDays(thisWeek, UPCOMING_WEEKS * 7);
  const from = first < thisWeek ? first : thisWeek;

  const weeks = [];
  for (let ws = from; ws <= lastShown; ws = addDays(ws, 7)) {
    const we = addDays(ws, 7);
    let due = 0;
    let carry = 0;
    let collected = 0;
    for (const inst of installments) {
      if (inst.dueDate >= ws && inst.dueDate < we) due += inst.amount;
      if (inst.dueDate < ws) carry += Math.max(0, inst.amount - paidUntil(inst, ws));
      for (const p of inst.payments) if (p.day >= ws && p.day < we) collected += p.amount;
    }
    const target = due + carry;
    weeks.push({
      weekStart: ws,
      weekEnd: addDays(ws, 6),
      state: ws < thisWeek ? 'pasada' : ws === thisWeek ? 'actual' : 'futura',
      due: round2(due),
      carry: round2(carry),
      target: round2(target),
      collected: round2(collected),
      pending: round2(Math.max(0, target - collected)),
    });
  }
  return weeks;
}

goalsRouter.get('/goals', requireAuth, async (req, res) => {
  const courierId = req.user?.role === 'repartidor' ? req.user.sub : undefined;
  const installments = await loadInstallments(courierId);
  const today = arToday();

  const byCourier = new Map<string, { name: string; list: InstallmentRow[] }>();
  for (const inst of installments) {
    const entry = byCourier.get(inst.courierId) ?? { name: inst.courierName, list: [] };
    entry.list.push(inst);
    byCourier.set(inst.courierId, entry);
  }

  const couriers = Array.from(byCourier.entries()).map(([id, { name, list }]) => ({
    courierId: id,
    courierName: name,
    weeks: weeksForCourier(list, today),
  }));
  res.json({ couriers });
});
