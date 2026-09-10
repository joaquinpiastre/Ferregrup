import { downloadHtmlAsPdf, printHtml } from './docPrint';
import type { StreetOrderItem } from './types';

export interface SaleDoc {
  title: string;
  fileNameBase: string;
  clientName?: string;
  staffName: string;
  items: StreetOrderItem[];
  total: number;
  notes?: string;
  footNote?: string;
  createdAt: number;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function saleDocHtml(doc: SaleDoc): string {
  const itemsHtml = doc.items
    .map(
      (it) => `
      <tr>
        <td class="cod">${it.code ?? '—'}</td>
        <td>${it.description}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">$${it.unitPrice.toFixed(2)}</td>
        <td class="num bold">$${it.subtotal.toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${doc.title} — Ferregrup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #222; font-size: 14px; }
  h1 { color: #b89b00; font-size: 24px; margin-bottom: 2px; }
  h2 { font-size: 16px; color: #444; margin-bottom: 12px; }
  hr { border: none; border-top: 2px solid #FFE000; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 16px; }
  .field label { color: #888; font-size: 12px; display: block; }
  .field span { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  thead th { background: #FFE000; color: #000; padding: 8px 10px; text-align: left; font-size: 13px; }
  thead th.num { text-align: right; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  td.cod { color: #b89b00; font-weight: 600; white-space: nowrap; }
  td.num { text-align: right; white-space: nowrap; }
  td.bold { font-weight: 700; }
  .total-box { margin-top: 14px; text-align: right; }
  .total { font-size: 22px; font-weight: 800; color: #b89b00; }
  .notes { margin-top: 14px; padding: 10px 14px; background: #fff8e1; border-radius: 8px; font-size: 13px; }
  footer { margin-top: 40px; color: #aaa; font-size: 11px; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <h1>Ferregrup</h1>
  <h2>${doc.title}</h2>
  <hr>
  <div class="grid">
    <div class="field"><label>Fecha</label><span>${fmtDate(doc.createdAt)}</span></div>
    <div class="field"><label>Atendido por</label><span>${doc.staffName}</span></div>
    ${doc.clientName ? `<div class="field" style="grid-column:1/-1"><label>Cliente</label><span>${doc.clientName}</span></div>` : ''}
  </div>
  <table>
    <thead><tr><th>Código</th><th>Descripción</th><th class="num">Cant.</th><th class="num">P. Unit.</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="total-box"><span class="total">Total: $${doc.total.toFixed(2)}</span></div>
  ${doc.notes ? `<div class="notes"><strong>Notas:</strong> ${doc.notes}</div>` : ''}
  ${doc.footNote ? `<div class="notes">${doc.footNote}</div>` : ''}
  <footer>Impreso desde Ferregrup · ${fmtDate(Date.now())}</footer>
</body>
</html>`;
}

export function printSaleDoc(doc: SaleDoc): void {
  printHtml(saleDocHtml(doc));
}

export async function downloadSaleDocPdf(doc: SaleDoc): Promise<void> {
  await downloadHtmlAsPdf(saleDocHtml(doc), doc.fileNameBase);
}
