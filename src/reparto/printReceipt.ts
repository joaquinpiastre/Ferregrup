import { downloadHtmlAsPdf, printHtml } from './docPrint';
import { remitoHtml } from './remitoLayout';
import type { Payment, PaymentMethod } from './types';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

/** Un cobro dentro de un recibo; `detail`/`cuota` describen a qué corresponde (ej. "Cuota 2/6 — Taladro"). */
export interface ReceiptLine {
  payment: Payment;
  detail?: string;
  cuota?: string;
}

function receiptHtml(lines: ReceiptLine[]): string {
  const first = lines[0].payment;
  const method = METHOD_LABEL[first.method];
  const cheque = first.method === 'cheque' && first.checkNumber ? ` N° ${first.checkNumber}${first.bank ? ` (${first.bank})` : ''}` : '';
  const total = lines.reduce((sum, l) => sum + l.payment.amount, 0);
  const notes = Array.from(new Set(lines.map((l) => l.payment.notes).filter(Boolean)));
  return remitoHtml({
    title: 'RECIBO',
    date: first.createdAt,
    clientName: first.clientName,
    rows: lines.map((l) => ({
      detail: l.detail ?? `Cobro a cuenta — ${method}${cheque}`,
      cuota: l.cuota,
      amount: l.payment.amount,
    })),
    total: lines.length > 1 ? total : undefined,
    notes: [...notes, lines.length > 1 ? `Pagado en ${method}${cheque}` : '', `Cobrado por ${first.courierName}`].filter(Boolean).join(' — '),
  });
}

export function printPaymentReceipt(payment: Payment): void {
  printHtml(receiptHtml([{ payment }]));
}

export async function downloadPaymentReceiptPdf(payment: Payment): Promise<void> {
  await downloadHtmlAsPdf(receiptHtml([{ payment }]), `recibo-${payment.id}`);
}

/** Un único recibo con todos los cobros hechos juntos (varias cuotas/productos). */
export function printPaymentsReceipt(lines: ReceiptLine[]): void {
  printHtml(receiptHtml(lines));
}

export async function downloadPaymentsReceiptPdf(lines: ReceiptLine[]): Promise<void> {
  await downloadHtmlAsPdf(receiptHtml(lines), `recibo-${lines[0].payment.id}`);
}
