// Formulario impreso de El Maná, igual al talonario de papel: encabezado con logo y datos de
// la distribuidora, recuadro "X — documento no válido como factura", fecha en DIA/MES/AÑO,
// datos del cliente, condición de IVA, y la tabla CÓDIGO / DETALLE / CUOTA / IMPORTE.

export interface RemitoRow {
  code?: string;
  detail: string;
  cuota?: string;
  amount: number;
}

export interface RemitoData {
  /** Nombre del documento, en el recuadro de arriba a la derecha (REMITO, RECIBO, COTIZACIÓN). */
  title: string;
  date: number;
  clientName?: string;
  rows: RemitoRow[];
  /** Si se pasa, se agrega una fila TOTAL al final de la tabla. */
  total?: number;
  /** Texto para la columna CUOTA de la fila TOTAL (ej. "12 x $5.000"). */
  totalCuota?: string;
  notes?: string;
}

const MIN_ROWS = 14;

export function esc(s: string | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);
}

export function remitoHtml(d: RemitoData): string {
  const date = new Date(d.date);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const rows = d.rows.map(
    (r) => `<tr>
      <td class="c-code">${esc(r.code)}</td>
      <td class="c-detail">${esc(r.detail)}</td>
      <td class="c-cuota">${esc(r.cuota)}</td>
      <td class="c-amount">${money(r.amount)}</td>
    </tr>`
  );
  if (d.total !== undefined) {
    rows.push(`<tr class="total">
      <td class="c-code"></td>
      <td class="c-detail" style="text-align:right">TOTAL</td>
      <td class="c-cuota">${esc(d.totalCuota)}</td>
      <td class="c-amount">${money(d.total)}</td>
    </tr>`);
  }
  const blank = `<tr><td class="c-code"></td><td class="c-detail"></td><td class="c-cuota"></td><td class="c-amount"></td></tr>`;
  while (rows.length < MIN_ROWS) rows.push(blank);

  const checks = [
    'Resp. Inscripto', 'Exento', 'No Responsable', 'Resp. Monot.', 'Cons. Final',
    'Peq. Cont. Even.', 'Monot. Social', 'Peq. Cont. Even. Soc.', 'Suj. no Categ.',
  ].map((l) => `<span class="chk"><i></i>${l}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — El Maná</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 13px; padding: 24px; background: #fff; }
  .sheet { border: 2px solid #111; border-radius: 6px; width: 100%; }
  .head { display: grid; grid-template-columns: 1.5fr 54px 1fr; border-bottom: 1.5px solid #111; }
  .brand { padding: 10px 14px 6px; }
  .brand img { width: 215px; display: block; }
  .brand .sub { font-size: 11px; font-weight: 700; letter-spacing: .02em; margin: 2px 0 8px 14px; }
  .brand .contact { font-size: 15px; font-weight: 700; border-bottom: 1.5px solid #111; padding-bottom: 3px; }
  .brand .iva { font-size: 13px; letter-spacing: .06em; margin-top: 3px; }
  .xbox { border-left: 1.5px solid #111; border-right: 1.5px solid #111; text-align: center; padding: 8px 4px; }
  .xbox .x { font-size: 38px; font-weight: 800; border: 2px solid #111; width: 38px; margin: 0 auto 6px; line-height: 1.15; }
  .xbox .no { font-size: 7px; line-height: 1.25; text-transform: uppercase; }
  .doc { padding: 10px 14px; }
  .doc h1 { font-size: 30px; letter-spacing: .01em; }
  .dates { display: flex; gap: 6px; margin-top: 10px; }
  .dates div { flex: 1; border: 1.5px solid #111; border-radius: 4px; height: 44px; font-size: 10px; text-align: center; padding-top: 2px; }
  .dates b { display: block; font-size: 16px; margin-top: 2px; }
  .line { display: flex; gap: 14px; padding: 8px 14px 4px; align-items: flex-end; }
  .line .f { flex: 1; border-bottom: 1px dashed #555; min-height: 20px; white-space: nowrap; overflow: hidden; }
  .line .f.small { flex: .7; }
  .line label { font-size: 12px; margin-right: 4px; }
  .line .f b { font-size: 13px; }
  .iva-row { display: grid; grid-template-columns: 1fr 200px; border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; margin-top: 6px; }
  .iva-row .l { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
  .iva-row .l strong { font-size: 14px; }
  .iva-row .l .checks { display: flex; flex-wrap: wrap; gap: 3px 10px; font-size: 9px; }
  .chk { display: inline-flex; align-items: center; gap: 3px; }
  .chk i { width: 9px; height: 9px; border: 1.2px solid #111; display: inline-block; }
  .iva-row .r { border-left: 1.5px solid #111; padding: 6px 8px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 11px; letter-spacing: .18em; font-weight: 600; padding: 3px 6px; border-bottom: 1.5px solid #111; text-align: center; }
  thead th + th, tbody td + td { border-left: 1.5px solid #111; }
  tbody td { height: 27px; padding: 3px 6px; border-bottom: 1px dashed #777; font-size: 12px; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr.total td { border-bottom: 1px solid #111; font-weight: 700; }
  .c-code { width: 12%; white-space: nowrap; }
  .c-cuota { width: 14%; text-align: center; }
  .c-amount { width: 17%; text-align: right; white-space: nowrap; }
  .notes { border-top: 1.5px solid #111; padding: 6px 14px; font-size: 12px; }
  .sign { border-top: 1.5px solid #111; padding: 14px 14px 10px; font-size: 14px; }
  .sign span { display: inline-block; width: 220px; border-bottom: 1px dashed #555; margin-left: 4px; }
  @media print { body { padding: 0; } @page { margin: 10mm; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div class="brand">
      <img src="${origin}/mana-logo-print.png" alt="El Maná">
      <div class="sub">DISTRIBUIDORA DE HERRAMIENTAS</div>
      <div class="contact">WhatsApp 2604603702 &nbsp; · &nbsp; AV. Granaderos 575</div>
      <div class="iva">IVA. RESPONSABLE INSCRIPTO</div>
    </div>
    <div class="xbox">
      <div class="x">X</div>
      <div class="no">Documento<br>no válido<br>como<br>factura</div>
    </div>
    <div class="doc">
      <h1>${esc(d.title)}</h1>
      <div class="dates">
        <div>DIA<b>${String(date.getDate()).padStart(2, '0')}</b></div>
        <div>MES<b>${String(date.getMonth() + 1).padStart(2, '0')}</b></div>
        <div>AÑO<b>${date.getFullYear()}</b></div>
      </div>
    </div>
  </div>
  <div class="line"><label>SEÑOR/ES:</label><div class="f"><b>${esc(d.clientName)}</b></div><label>Tel:</label><div class="f small"></div></div>
  <div class="line"><label>DOMICILIO:</label><div class="f"></div><label>CIUDAD/LOC.:</label><div class="f small"></div></div>
  <div class="iva-row">
    <div class="l"><strong>IVA.</strong><div class="checks">${checks}</div></div>
    <div class="r">CUIT.</div>
  </div>
  <table>
    <thead><tr><th>CÓDIGO</th><th>DETALLE</th><th>CUOTA</th><th>IMPORTE</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  ${d.notes ? `<div class="notes"><strong>Observaciones:</strong> ${esc(d.notes)}</div>` : ''}
  <div class="sign">FIRMA:<span></span></div>
</div>
</body>
</html>`;
}
