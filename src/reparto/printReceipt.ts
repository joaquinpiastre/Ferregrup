import { downloadHtmlAsPdf, printHtml } from './docPrint';
import { remitoHtml } from './remitoLayout';
import type { Payment, PaymentMethod } from './types';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

function receiptHtml(payment: Payment): string {
  const method = METHOD_LABEL[payment.method];
  const cheque = payment.method === 'cheque' && payment.checkNumber ? ` N° ${payment.checkNumber}${payment.bank ? ` (${payment.bank})` : ''}` : '';
  return remitoHtml({
    title: 'RECIBO',
    date: payment.createdAt,
    clientName: payment.clientName,
    rows: [{ detail: `Cobro a cuenta — ${method}${cheque}`, amount: payment.amount }],
    total: payment.amount,
    notes: [payment.notes, `Cobrado por ${payment.courierName}`].filter(Boolean).join(' — '),
  });
}

export function printPaymentReceipt(payment: Payment): void {
  printHtml(receiptHtml(payment));
}

export async function downloadPaymentReceiptPdf(payment: Payment): Promise<void> {
  await downloadHtmlAsPdf(receiptHtml(payment), `recibo-${payment.id}`);
}
