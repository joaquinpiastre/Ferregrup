import { downloadHtmlAsPdf, printHtml } from './docPrint';
import { remitoHtml } from './remitoLayout';
import type { StreetOrder } from './types';

const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function ticketHtml(order: StreetOrder): string {
  return remitoHtml({
    title: 'REMITO',
    date: order.createdAt,
    clientName: order.clientName,
    rows: order.items.map((it) => ({
      code: it.code,
      detail: `${it.quantity} x ${it.description} (${money(it.unitPrice)} c/u)`,
      amount: it.subtotal,
    })),
    total: order.total,
    notes: [`Calle: ${order.streetLabel}`, `Repartidor: ${order.courierName}`, order.notes].filter(Boolean).join(' — '),
  });
}

export function printStreetOrder(order: StreetOrder): void {
  printHtml(ticketHtml(order));
}

export async function downloadStreetOrderPdf(order: StreetOrder): Promise<void> {
  await downloadHtmlAsPdf(ticketHtml(order), `remito-${order.streetKey || order.id}`);
}
