import { downloadHtmlAsPdf, printHtml } from './docPrint';
import type { Payment, PaymentMethod } from './types';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function receiptHtml(payment: Payment): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recibo de cobro — Ferregrup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #222; font-size: 14px; }
  h1 { color: #b89b00; font-size: 24px; margin-bottom: 2px; }
  hr { border: none; border-top: 2px solid #FFE000; margin-bottom: 20px; }
  .title { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #333; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-bottom: 20px; }
  .field label { color: #888; font-size: 12px; display: block; }
  .field span { font-weight: 600; font-size: 15px; }
  .amount-box { background: #fff8d6; border-radius: 10px; padding: 18px 20px; text-align: center; margin-bottom: 20px; }
  .amount { font-size: 32px; font-weight: 800; color: #b89b00; }
  .amount-label { font-size: 12px; color: #998a3a; text-transform: uppercase; letter-spacing: 0.05em; }
  .notes { margin-top: 6px; padding: 10px 14px; background: #fafafa; border-radius: 8px; font-size: 13px; }
  footer { margin-top: 50px; color: #aaa; font-size: 11px; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <h1>Ferregrup</h1>
  <hr>
  <div class="title">Recibo de cobro</div>
  <div class="amount-box">
    <div class="amount-label">Monto cobrado</div>
    <div class="amount">${fmtMoney(payment.amount)}</div>
  </div>
  <div class="grid">
    <div class="field"><label>Cliente</label><span>${payment.clientName}</span></div>
    <div class="field"><label>Fecha</label><span>${fmtDate(payment.createdAt)}</span></div>
    <div class="field"><label>Repartidor</label><span>${payment.courierName}</span></div>
    <div class="field"><label>Método de pago</label><span>${METHOD_LABEL[payment.method]}</span></div>
    ${payment.method === 'cheque' && payment.checkNumber ? `<div class="field"><label>N° de cheque</label><span>${payment.checkNumber}</span></div>` : ''}
    ${payment.method === 'cheque' && payment.bank ? `<div class="field"><label>Banco</label><span>${payment.bank}</span></div>` : ''}
  </div>
  ${payment.notes ? `<div class="notes"><strong>Observaciones:</strong> ${payment.notes}</div>` : ''}
  <footer>Comprobante generado desde Ferregrup · ${fmtDate(Date.now())}</footer>
</body>
</html>`;
}

export function printPaymentReceipt(payment: Payment): void {
  printHtml(receiptHtml(payment));
}

export async function downloadPaymentReceiptPdf(payment: Payment): Promise<void> {
  await downloadHtmlAsPdf(receiptHtml(payment), `recibo-${payment.id}`);
}
