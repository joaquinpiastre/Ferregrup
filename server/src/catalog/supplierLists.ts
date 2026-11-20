import * as XLSX from 'xlsx';
import { z } from 'zod/v4';

// Listas de precios de proveedores: leer la planilla (xls, xlsx o csv), mostrar su estructura
// y calcular costo y precio de venta de cada producto con la regla de ese proveedor.
// Lo usan la ruta POST /catalog/supplier-lists (que guarda) y el asistente de IA (que mira la
// planilla y arma la regla con lo que le explica el usuario).
//
// Convenciones del catálogo: el costo se guarda SIN IVA, el precio de venta es final (CON IVA)
// y la ganancia se mide contra el costo con IVA.

export type Cell = string | number | boolean | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

/** Error esperable (hoja o columna inexistente, regla incompleta): se le muestra al usuario. */
export class ListError extends Error {}

// ─── Lectura ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; sheets: Sheet[] }>();
const CACHE_MS = 10 * 60_000;

/** Lee todas las hojas. Se guarda unos minutos en memoria: la IA suele mirar el mismo archivo varias veces. */
export function readWorkbook(fileId: string, data: Buffer): Sheet[] {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
  const hit = cache.get(fileId);
  if (hit) return hit.sheets;
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false, cellDates: false, dense: true });
  } catch {
    throw new ListError('No se pudo leer el archivo: tiene que ser una planilla de Excel (.xlsx o .xls) o un .csv.');
  }
  const sheets = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    // Sin las filas vacías del final.
    let end = rows.length;
    while (end > 0 && !rows[end - 1].some((c) => cellText(c) !== '')) end--;
    return { name, rows: rows.slice(0, end) };
  });
  if (cache.size >= 4) cache.delete(cache.keys().next().value!);
  cache.set(fileId, { at: now, sheets });
  return sheets;
}

/** Texto de una celda: sin espacios duros ni dobles. Los números enteros van sin ".0". */
export function cellText(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v).replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Número de una celda. Entiende "1.234,56", "1,234.56", "$ 1.234", "21%" (→ 0,21). */
export function cellNumber(v: Cell | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/U\$S|USD|ARS|\$|\s|\u00a0/gi, '');
  if (!s) return null;
  const pct = s.endsWith('%');
  if (pct) s = s.slice(0, -1);
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma > -1) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return pct ? n / 100 : n;
}

export function columnLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function letterIndex(letters: string): number {
  return [...letters].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Fila (índice desde 0) que parece ser la de encabezados: la que más textos cortos tiene entre las primeras 40. */
export function guessHeaderRow(rows: Cell[][]): number {
  let best = -1;
  let bestScore = 1;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const score = rows[r].filter((c) => typeof c === 'string' && cellText(c).length >= 2 && cellText(c).length <= 60 && cellNumber(c) === null).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return Math.max(best, 0);
}

function findSheet(sheets: Sheet[], name: string): Sheet {
  const s = sheets.find((x) => x.name === name) ?? sheets.find((x) => norm(x.name) === norm(name));
  if (!s) throw new ListError(`No existe la hoja "${name}". Las hojas del archivo son: ${sheets.map((x) => `"${x.name}"`).join(', ')}.`);
  return s;
}

/** Columna por encabezado (exacto o parcial, sin distinguir mayúsculas ni acentos) o por letra ("F"). */
function resolveColumn(ref: string, header: Cell[], what: string): number {
  const want = norm(ref);
  const heads = header.map((h) => norm(cellText(h)));
  const exact = heads.findIndex((h) => h === want);
  if (exact >= 0) return exact;
  if (/^[A-Z]{1,3}$/.test(ref.trim())) return letterIndex(ref.trim());
  const partial = heads.map((h, i) => (h && h.includes(want) ? i : -1)).filter((i) => i >= 0);
  if (partial.length === 1) return partial[0];
  const list = header.map((h, i) => (cellText(h) ? `${columnLetter(i)}: ${cellText(h)}` : null)).filter(Boolean).join(' | ');
  if (partial.length > 1) throw new ListError(`La columna "${ref}" (${what}) coincide con varias: indicala por su letra. Columnas: ${list}`);
  throw new ListError(`No encontré la columna "${ref}" (${what}). Columnas de la fila de encabezados: ${list}`);
}

// ─── Estructura de la planilla (para que la IA la entienda) ────────────────────

export function inspectSheets(fileName: string, sheets: Sheet[], opts: { hoja?: string; desde_fila?: number; filas?: number }) {
  const summaries = sheets.map((s) => {
    const h = guessHeaderRow(s.rows);
    return {
      nombre: s.name,
      filas: s.rows.length,
      fila_encabezado_probable: h + 1,
      encabezados: (s.rows[h] ?? []).map((c, i) => (cellText(c) ? `${columnLetter(i)}: ${cellText(c).slice(0, 40)}` : null)).filter(Boolean),
    };
  });
  const sheet = opts.hoja ? findSheet(sheets, opts.hoja) : sheets.find((s) => s.rows.length > 0) ?? sheets[0];
  if (!sheet) return { archivo: fileName, hojas: summaries };

  const h = guessHeaderRow(sheet.rows);
  const header = sheet.rows[h] ?? [];
  const data = sheet.rows.slice(h + 1);
  const width = Math.min(Math.max(header.length, ...data.slice(0, 50).map((r) => r.length)), 40);
  const columnas = [];
  const seenHeads = new Map<string, number>();
  for (let c = 0; c < width; c++) {
    const head = cellText(header[c]);
    if (head) seenHeads.set(norm(head), (seenHeads.get(norm(head)) ?? 0) + 1);
    const values = data.map((r) => r[c]).filter((v) => cellText(v) !== '');
    if (!head && values.length === 0) continue;
    const nums = values.map((v) => cellNumber(v)).filter((n): n is number => n !== null).sort((a, b) => a - b);
    const distinct = new Map<string, number>();
    for (const v of values) {
      const k = cellText(v).slice(0, 30);
      distinct.set(k, (distinct.get(k) ?? 0) + 1);
      if (distinct.size > 8) break;
    }
    columnas.push({
      letra: columnLetter(c),
      encabezado: head || null,
      con_datos: values.length,
      numericos: nums.length,
      ...(nums.length ? { min: nums[0], mediana: nums[Math.floor(nums.length / 2)], max: nums[nums.length - 1] } : {}),
      ...(distinct.size <= 8 ? { valores: Object.fromEntries(distinct) } : { ejemplos: values.slice(0, 3).map((v) => (typeof v === 'number' ? v : cellText(v).slice(0, 40))) }),
    });
  }
  const repeated = [...seenHeads.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const from = Math.max((opts.desde_fila ?? h + 1) - 1, 0);
  const count = Math.min(opts.filas ?? 12, 40);
  const filas = sheet.rows.slice(from, from + count).map((r, i) => [
    from + i + 1,
    ...r.slice(0, width).map((v) => (typeof v === 'number' ? v : cellText(v).slice(0, 50) || null)),
  ]);
  // Notas: filas con un texto largo en la primera celda (condiciones, IVA, fecha de la lista).
  const notas = sheet.rows
    .filter((r) => r.filter((v) => cellText(v) !== '').length === 1 && cellText(r.find((v) => cellText(v) !== '')).length > 40)
    .slice(0, 6)
    .map((r) => cellText(r.find((v) => cellText(v) !== '')).slice(0, 300));

  return {
    archivo: fileName,
    hojas: summaries,
    hoja: {
      nombre: sheet.name,
      fila_encabezado_probable: h + 1,
      ...(repeated.length ? { aviso: `Hay encabezados repetidos (${repeated.join(', ')}): para esas columnas usá la letra.` } : {}),
      columnas,
      filas: { formato: '[número de fila, celda A, celda B, …]', datos: filas },
      ...(notas.length ? { notas } : {}),
    },
  };
}

// ─── Regla de precios ───────────────────────────────────────────────────────────

const col = (what: string) => z.string().trim().min(1).describe(`Columna ${what}: el encabezado tal cual figura en la planilla o la letra de la columna ("F").`);

export const sheetRuleSchema = z
  .object({
    hoja: z.string().trim().min(1).describe('Nombre exacto de la hoja.'),
    fila_encabezado: z.number().int().min(1).max(200).optional().describe('Fila de los encabezados (como la numera Excel). Si no se indica, se detecta.'),
    codigo: col('del código del producto'),
    descripcion: z.array(col('de la descripción')).min(1).max(4).describe('Una o varias columnas que se juntan para armar la descripción (ej.: ["Producto", "Medida"]).'),
    agregar_a_descripcion: z.string().trim().max(40).optional().describe('Texto que se agrega al final de cada descripción, normalmente la marca (ej.: "BOSCH"), si la descripción no lo trae.'),
    precio: col('del precio base de la lista (el que da el proveedor)'),
    moneda: z.enum(['ARS', 'USD']).default('ARS').describe('Moneda del precio base.'),
    cotizacion_dolar: z.number().positive().max(1_000_000).optional().describe('Pesos por dólar. Obligatorio si la moneda es USD: preguntale al usuario qué cotización usar.'),
    precio_con_iva: z.boolean().default(false).describe('true si el precio base ya incluye el IVA (se le saca para obtener el costo sin IVA).'),
    descuentos: z.array(z.number().min(0).max(99.99)).max(5).default([]).describe('Descuentos en % que hace el proveedor, aplicados uno tras otro sobre el precio base (ej.: [30] o [10, 5]).'),
    recargos: z.array(z.number().min(0).max(1000)).max(5).default([]).describe('Recargos en % que suben el costo, uno tras otro (ej.: flete o envío [5]).'),
    iva_columna: col('del IVA de cada producto (acepta 0,21 o 21)').optional(),
    iva_fijo: z.number().min(0).max(27).optional().describe('IVA en % igual para todos (ej.: 21). Usá esto o iva_columna, no los dos.'),
    venta_modo: z
      .enum(['ganancia', 'columna'])
      .default('ganancia')
      .describe('"ganancia": venta = costo con IVA + ganancia %. "columna": venta = precio de otra columna de la lista (ej.: precio sugerido) + venta_recargo %.'),
    ganancia: z.number().min(0).max(1000).optional().describe('Ganancia en % sobre el costo con IVA (modo "ganancia"). Ej.: 40'),
    venta_columna: col('del precio de venta sugerido (modo "columna")').optional(),
    venta_columna_con_iva: z.boolean().default(true).describe('Modo "columna": true si ese precio ya incluye IVA.'),
    venta_recargo: z.number().min(-90).max(1000).default(0).describe('Modo "columna": % que se suma (o resta, si es negativo) al precio de esa columna. Ej.: 15'),
    si_venta_vacia_ganancia_columna: col('con el % de ganancia de cada producto, para cuando la columna de venta viene vacía o en 0 (acepta 0,5 o 50)').optional(),
    si_venta_vacia_ganancia: z.number().min(0).max(1000).optional().describe('% de ganancia sobre el costo con IVA para cuando la columna de venta viene vacía o en 0.'),
    precio_minimo: z.number().min(0).optional().describe('Se saltean las filas con precio base menor a esto (ej.: exhibidores sin cargo a centavos).'),
  })
  .superRefine((r, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if ((r.iva_columna ? 1 : 0) + (r.iva_fijo !== undefined ? 1 : 0) !== 1) issue(`Hoja "${r.hoja}": indicá iva_columna o iva_fijo (uno solo).`);
    if (r.moneda === 'USD' && !r.cotizacion_dolar) issue(`Hoja "${r.hoja}": los precios están en dólares, falta cotizacion_dolar.`);
    if (r.venta_modo === 'ganancia' && r.ganancia === undefined) issue(`Hoja "${r.hoja}": falta el % de ganancia.`);
    if (r.venta_modo === 'columna' && !r.venta_columna) issue(`Hoja "${r.hoja}": falta venta_columna.`);
  });

export const supplierListSchema = z.object({
  archivo: z.string().trim().min(1).describe('Id del archivo adjunto (viene en <adjuntos>).'),
  proveedor: z.string().trim().min(2).max(80).describe('Nombre del proveedor. Si ya tiene productos en el catálogo, usá exactamente el mismo nombre.'),
  hojas: z.array(sheetRuleSchema).min(1).max(10).describe('Una entrada por hoja a cargar, cada una con su regla (pueden ser distintas).'),
  redondeo: z.enum(['centavos', 'peso', 'diez', 'cien']).default('peso').describe('Redondeo del precio de venta. Por defecto, al peso.'),
  dar_de_baja_faltantes: z
    .boolean()
    .default(false)
    .describe('Si el proveedor ya tenía productos: true da de baja los que no están en esta lista. Usalo solo si la lista es completa y el usuario lo pidió.'),
});

export type SheetRule = z.infer<typeof sheetRuleSchema>;
export type SupplierListInput = z.infer<typeof supplierListSchema>;

export interface PlannedProduct {
  code: string;
  description: string;
  costPrice: number;
  ivaRate: number;
  unitPrice: number;
  base: number;
  currency: 'ARS' | 'USD';
  sheet: string;
  row: number;
}

export interface Skipped {
  hoja: string;
  fila: number;
  codigo?: string;
  motivo: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ROUND_STEP = { centavos: 0.01, peso: 1, diez: 10, cien: 100 } as const;
const roundTo = (n: number, step: number) => (step === 0.01 ? round2(n) : Math.floor(n / step + 0.5) * step);
/** "0,5" y "50" son lo mismo: 50 %. */
const asPercent = (n: number) => (Math.abs(n) <= 1.5 ? n * 100 : n);

/** Calcula costo, IVA y precio de venta de cada fila. No toca la base. */
export function planProducts(sheets: Sheet[], input: SupplierListInput): { products: PlannedProduct[]; skipped: Skipped[]; titleRows: number } {
  const products: PlannedProduct[] = [];
  const skipped: Skipped[] = [];
  const seen = new Map<string, string>();
  const step = ROUND_STEP[input.redondeo];
  let titleRows = 0;

  for (const rule of input.hojas) {
    const sheet = findSheet(sheets, rule.hoja);
    const h = rule.fila_encabezado ? rule.fila_encabezado - 1 : guessHeaderRow(sheet.rows);
    const header = sheet.rows[h] ?? [];
    const iCode = resolveColumn(rule.codigo, header, 'código');
    const iDesc = rule.descripcion.map((d) => resolveColumn(d, header, 'descripción'));
    const iPrice = resolveColumn(rule.precio, header, 'precio');
    const iIva = rule.iva_columna ? resolveColumn(rule.iva_columna, header, 'IVA') : -1;
    const iSale = rule.venta_modo === 'columna' && rule.venta_columna ? resolveColumn(rule.venta_columna, header, 'precio de venta') : -1;
    const iFallback = rule.si_venta_vacia_ganancia_columna ? resolveColumn(rule.si_venta_vacia_ganancia_columna, header, '% de ganancia') : -1;
    const fx = rule.moneda === 'USD' ? rule.cotizacion_dolar! : 1;
    const factor = rule.descuentos.reduce((f, d) => f * (1 - d / 100), 1) * rule.recargos.reduce((f, r) => f * (1 + r / 100), 1);
    const suffix = rule.agregar_a_descripcion?.trim();

    for (let r = h + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const fila = r + 1;
      const code = cellText(row[iCode]);
      let description = iDesc.map((i) => cellText(row[i])).filter(Boolean).join(' ');
      if (!code) {
        if (description || row.some((c) => cellText(c) !== '')) titleRows++;
        continue;
      }
      const base = cellNumber(row[iPrice]);
      if (base === null || base <= 0) {
        skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: 'sin precio' });
        continue;
      }
      if (rule.precio_minimo !== undefined && base < rule.precio_minimo) {
        skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: 'precio menor al mínimo' });
        continue;
      }
      if (!description) {
        skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: 'sin descripción' });
        continue;
      }
      if (suffix && !norm(description).includes(norm(suffix))) description = `${description} ${suffix}`;
      let iva = rule.iva_fijo ?? 0;
      if (iIva >= 0) {
        const v = cellNumber(row[iIva]);
        if (v === null || v < 0) {
          skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: 'sin IVA' });
          continue;
        }
        iva = round2(v <= 1 ? v * 100 : v);
      }
      if (iva > 27) {
        skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: `IVA raro (${iva}%)` });
        continue;
      }
      const baseArs = base * fx;
      const withoutIva = rule.precio_con_iva ? baseArs / (1 + iva / 100) : baseArs;
      const cost = withoutIva * factor;
      const costWithIva = cost * (1 + iva / 100);

      let sale: number | null = null;
      if (rule.venta_modo === 'ganancia') sale = costWithIva * (1 + rule.ganancia! / 100);
      else {
        const v = cellNumber(row[iSale]);
        const extra = 1 + rule.venta_recargo / 100;
        if (v !== null && v > 0) sale = v * fx * (rule.venta_columna_con_iva ? 1 : 1 + iva / 100) * extra;
        else if (iFallback >= 0) {
          const p = cellNumber(row[iFallback]);
          if (p !== null && p > 0) sale = costWithIva * (1 + asPercent(p) / 100) * extra;
        } else if (rule.si_venta_vacia_ganancia !== undefined) sale = costWithIva * (1 + rule.si_venta_vacia_ganancia / 100) * extra;
      }
      const unitPrice = sale === null ? 0 : roundTo(sale, step);
      if (!(unitPrice > 0)) {
        skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: 'sin precio de venta' });
        continue;
      }
      const first = seen.get(code);
      if (first) {
        skipped.push({ hoja: sheet.name, fila, codigo: code, motivo: `código repetido (ya estaba en ${first})` });
        continue;
      }
      seen.set(code, `"${sheet.name}" fila ${fila}`);
      products.push({
        code: code.slice(0, 60),
        description: description.slice(0, 300),
        costPrice: round2(cost),
        ivaRate: iva,
        unitPrice,
        base,
        currency: rule.moneda,
        sheet: sheet.name,
        row: fila,
      });
    }
  }
  return { products, skipped, titleRows };
}
