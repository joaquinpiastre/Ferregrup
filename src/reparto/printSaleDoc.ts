import { downloadHtmlAsPdf, printHtml } from './docPrint';
import { remitoHtml } from './remitoLayout';
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
  /** Plan de cuotas para la columna CUOTA de la fila TOTAL (ej. "12 x $5.000"). */
  installmentsLabel?: string;
  createdAt: number;
}

const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

// Una venta se imprime como REMITO; una cotización conserva su nombre.
function saleDocHtml(doc: SaleDoc): string {
  return remitoHtml({
    title: doc.title === 'Venta' ? 'REMITO' : doc.title.toUpperCase(),
    date: doc.createdAt,
    clientName: doc.clientName,
    rows: doc.items.map((it) => ({
      code: it.code,
      detail: `${it.quantity} x ${it.description} (${money(it.unitPrice)} c/u)`,
      amount: it.subtotal,
    })),
    total: doc.total,
    totalCuota: doc.installmentsLabel,
    notes: [doc.notes, doc.footNote].filter(Boolean).join(' — ') || undefined,
  });
}

export function printSaleDoc(doc: SaleDoc): void {
  printHtml(saleDocHtml(doc));
}

export async function downloadSaleDocPdf(doc: SaleDoc): Promise<void> {
  await downloadHtmlAsPdf(saleDocHtml(doc), doc.fileNameBase);
}
