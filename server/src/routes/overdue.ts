import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { arToday, daysBetween, loadInstallments, mondayOf, paidUntil } from '../collections.js';

export const overdueRouter = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

// Atrasada = cuota que venció en una semana anterior a la actual y todavía no está cobrada
// completa. Una cuota que vence esta semana no cuenta hasta que la semana termine.
overdueRouter.get('/overdue', requireAuth, async (req, res) => {
  const courierId = req.user?.role === 'repartidor' ? req.user.sub : undefined;
  const installments = await loadInstallments(courierId);
  const thisWeek = mondayOf(arToday());

  const clients = new Map<string, {
    clientId: string | null;
    clientName: string;
    courierNames: Set<string>;
    installments: {
      id: string; saleId: string; number: number; total: number; dueDate: string; weeksLate: number;
      amount: number; paid: number; remaining: number; courierName: string;
    }[];
  }>();

  for (const inst of installments) {
    if (inst.dueDate >= thisWeek) continue;
    const paid = paidUntil(inst);
    const remaining = round2(inst.amount - paid);
    if (remaining <= 0.005) continue;

    const key = inst.clientId ?? `name:${inst.clientName}`;
    const entry = clients.get(key) ?? { clientId: inst.clientId, clientName: inst.clientName, courierNames: new Set<string>(), installments: [] };
    entry.courierNames.add(inst.courierName);
    entry.installments.push({
      id: inst.id,
      saleId: inst.saleId,
      number: inst.number,
      total: inst.total,
      dueDate: inst.dueDate,
      weeksLate: Math.ceil(daysBetween(inst.dueDate, thisWeek) / 7),
      amount: inst.amount,
      paid: round2(paid),
      remaining,
      courierName: inst.courierName,
    });
    clients.set(key, entry);
  }

  const list = Array.from(clients.values())
    .map((c) => {
      const sorted = c.installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return {
        clientId: c.clientId,
        clientName: c.clientName,
        courierNames: Array.from(c.courierNames),
        overdueCount: sorted.length,
        totalRemaining: round2(sorted.reduce((sum, i) => sum + i.remaining, 0)),
        maxWeeksLate: Math.max(...sorted.map((i) => i.weeksLate)),
        installments: sorted,
      };
    })
    .sort((a, b) => b.maxWeeksLate - a.maxWeeksLate || b.totalRemaining - a.totalRemaining);

  res.json({
    clients: list,
    totalRemaining: round2(list.reduce((sum, c) => sum + c.totalRemaining, 0)),
    totalInstallments: list.reduce((sum, c) => sum + c.overdueCount, 0),
  });
});
