import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

export const catalogImportRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

interface ParsedRow {
  code: string;
  description: string;
  unitPrice: number;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cellNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'result' in value) {
    const r = (value as { result: unknown }).result;
    return typeof r === 'number' ? r : null;
  }
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cellText(value: unknown): string {
  if (value && typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim();
  }
  if (value && typeof value === 'object' && 'richText' in value) {
    return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim();
  }
  return String(value ?? '').trim();
}

/**
 * Busca la fila de encabezados (contiene "Codigo" y "Descripcion") entre las
 * primeras filas de la hoja, y a partir de ahí mapea las columnas por nombre.
 * Pensado para el formato de "Lista de precio vigente" del proveedor, pero
 * tolera variaciones razonables (otro orden de columnas, encabezados en otra fila).
 */
function parseWorkbook(workbook: ExcelJS.Workbook): { rows: ParsedRow[]; skipped: number } {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo no tiene ninguna hoja.');

  let headerRowNum = -1;
  let codeCol = -1;
  let descCol = -1;
  let priceCol = -1;

  for (let r = 1; r <= Math.min(40, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    let foundCode = -1;
    let foundDesc = -1;
    let foundPrice = -1;
    let fallbackPrice = -1;
    for (let c = 1; c <= sheet.columnCount; c++) {
      const header = normalizeHeader(row.getCell(c).value);
      if (!header) continue;
      if (foundCode < 0 && header === 'codigo') foundCode = c;
      if (foundDesc < 0 && (header === 'descripcion' || header === 'articulo')) foundDesc = c;
      if (foundPrice < 0 && (header === 'precio lista' || header === 'precio final' || header === 'precio')) foundPrice = c;
      if (fallbackPrice < 0 && header.startsWith('precio') && !header.includes('sin') && !header.includes('oferta') && !header.includes('cantidad')) {
        fallbackPrice = c;
      }
    }
    if (foundCode > 0 && foundDesc > 0) {
      headerRowNum = r;
      codeCol = foundCode;
      descCol = foundDesc;
      priceCol = foundPrice > 0 ? foundPrice : fallbackPrice;
      break;
    }
  }

  if (headerRowNum < 0 || priceCol < 0) {
    throw new Error('No se encontraron las columnas de Código, Descripción y Precio en el archivo.');
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const code = cellText(row.getCell(codeCol).value);
    const description = cellText(row.getCell(descCol).value);
    const unitPrice = cellNumber(row.getCell(priceCol).value);
    if (!code || !description || unitPrice === null || unitPrice <= 0) {
      if (code || description) skipped += 1;
      continue;
    }
    if (seen.has(code)) {
      skipped += 1;
      continue;
    }
    seen.add(code);
    rows.push({ code, description, unitPrice: Math.round(unitPrice * 100) / 100 });
  }

  return { rows, skipped };
}

catalogImportRouter.post(
  '/catalog/import/preview',
  requireAuth,
  requireRole('admin', 'superadmin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Subí un archivo .xlsx.' });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs's bundled types predate Node's current generic Buffer<ArrayBufferLike>;
      // the runtime value is a perfectly normal Buffer.
      await workbook.xlsx.load(req.file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      res.status(400).json({ error: 'El archivo no es un Excel (.xlsx) válido.' });
      return;
    }
    try {
      const { rows, skipped } = parseWorkbook(workbook);
      if (rows.length === 0) {
        res.status(400).json({ error: 'No se encontraron productos válidos en el archivo.' });
        return;
      }
      res.json({ rows, skipped, total: rows.length, fileName: req.file.originalname });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    }
  }
);

const confirmSchema = z.object({
  rows: z
    .array(
      z.object({
        code: z.string().min(1),
        description: z.string().min(1),
        unitPrice: z.number().positive(),
      })
    )
    .min(1),
});

catalogImportRouter.post('/catalog/import/confirm', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  const { rows } = parsed.data;
  const codes = rows.map((r) => r.code);
  const descriptions = rows.map((r) => r.description);
  const prices = rows.map((r) => r.unitPrice);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into catalog_products (code, description, unit_price, active, updated_at)
       select code, description, price, true, now()
       from unnest($1::text[], $2::text[], $3::numeric[]) as t(code, description, price)
       on conflict (code) do update set
         description = excluded.description,
         unit_price = excluded.unit_price,
         active = true,
         updated_at = now()`,
      [codes, descriptions, prices]
    );
    await client.query(`update catalog_products set active = false where not (code = any($1::text[]))`, [codes]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true, imported: rows.length });
});
