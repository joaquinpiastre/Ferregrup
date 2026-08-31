import type { StreetOrder } from './types';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ticketHtml(order: StreetOrder): string {
  const itemsHtml = order.items
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

  const nearbyHtml = order.nearbyClients.length
    ? `<div class="nearby">
        <strong>Clientes de la ruta en esa calle:</strong>
        <ul>${order.nearbyClients.map((c) => `<li>${c.name} — ${c.address}</li>`).join('')}</ul>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pedido — Ferregrup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #222; font-size: 14px; }
  h1 { color: #b89b00; font-size: 24px; margin-bottom: 2px; }
  hr { border: none; border-top: 2px solid #FFE000; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 16px; }
  .field label { color: #888; font-size: 12px; display: block; }
  .field span { font-weight: 600; }
  .badge { background: #fff8d6; color: #b89b00; padding: 2px 10px; border-radius: 4px; display: inline-block; font-weight: 700; text-transform: uppercase; font-size: 12px; }
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
  .nearby { margin-top: 14px; padding: 10px 14px; background: #fff8d6; border-radius: 8px; font-size: 13px; }
  .nearby ul { margin-top: 6px; padding-left: 18px; }
  footer { margin-top: 40px; color: #aaa; font-size: 11px; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <h1>Ferregrup</h1>
  <hr>
  <div class="grid">
    <div class="field"><label>Fecha</label><span>${fmtDate(order.createdAt)}</span></div>
    <div class="field"><label>Estado</label><span class="badge">${order.status}</span></div>
    <div class="field"><label>Repartidor</label><span>${order.courierName}</span></div>
    ${order.clientName ? `<div class="field"><label>Cliente</label><span>${order.clientName}</span></div>` : ''}
    <div class="field" style="grid-column:1/-1"><label>Calle de referencia</label><span>${order.streetLabel}</span></div>
  </div>
  <table>
    <thead><tr><th>Código</th><th>Descripción</th><th class="num">Cant.</th><th class="num">P. Unit.</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="total-box"><span class="total">Total: $${order.total.toFixed(2)}</span></div>
  ${order.notes ? `<div class="notes"><strong>Notas:</strong> ${order.notes}</div>` : ''}
  ${nearbyHtml}
  <footer>Impreso desde Ferregrup · ${fmtDate(Date.now())}</footer>
</body>
</html>`;
}

export function printStreetOrder(order: StreetOrder): void {
  const html = ticketHtml(order);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
