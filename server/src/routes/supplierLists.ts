import { Router } from 'express';
import { z } from 'zod/v4';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';
import { findUploadedFile } from './files.js';
import { ListError, planProducts, readWorkbook, supplierListSchema, type PlannedProduct } from '../catalog/supplierLists.js';

// Carga (o actualiza) en el catálogo la lista de precios de un proveedor, con la regla de costo
// y venta que se indique. La usa el asistente de IA: primero con dry_run (vista previa para que
// el usuario confirme) y después de verdad.
//
// - Productos nuevos: se crean con stock 0.
// - Códigos que ya son de ese proveedor: se actualizan descripción, costo, IVA y precio (y se
//   reactivan si estaban dados de baja). El stock no se toca.
// - Códigos que ya existen con otro proveedor (o sin proveedor): no se tocan, se informan.
// - Productos del proveedor que no vienen en la lista: se dan de baja solo si se pide.

export const supplierListsRouter = Router();

const requestSchema = supplierListSchema.extend({ dry_run: z.boolean().default(true) });

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Porcentaje con coma decimal, como se escribe acá (12,5).
const pct = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');

interface Existing {
  code: string;
  description: string;
  unit_price: string;
  cost_price: string | null;
  iva_rate: string;
  supplier: string | null;
  active: boolean;
}

function example(p: PlannedProduct, before?: Existing) {
  const withIva = p.costPrice * (1 + p.ivaRate / 100);
  return {
    codigo: p.code,
    descripcion: p.description,
    hoja: p.sheet,
    fila: p.row,
    precio_lista: p.currency === 'USD' ? `USD ${usd.format(p.base)}` : money.format(p.base),
    costo_sin_iva: money.format(p.costPrice),
    iva: `${p.ivaRate}%`,
    costo_con_iva: money.format(withIva),
    precio_venta: money.format(p.unitPrice),
    ganancia: `${pct((p.unitPrice / withIva - 1) * 100)}%`,
    ...(before ? { precio_anterior: money.format(Number(before.unit_price)) } : {}),
  };
}

supplierListsRouter.post('/catalog/supplier-lists', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(' ') });
    return;
  }
  const input = parsed.data;
  const file = await findUploadedFile(input.archivo, req.user!.sub);
  if (!file) {
    res.status(404).json({ error: 'No encontré ese archivo (se borran a los 30 días). Pedile al usuario que lo vuelva a adjuntar.' });
    return;
  }
  let plan: ReturnType<typeof planProducts>;
  try {
    plan = planProducts(readWorkbook(file.id, file.data), input);
  } catch (e) {
    if (e instanceof ListError) {
      res.status(400).json({ error: e.message });
      return;
    }
    throw e;
  }
  if (plan.products.length === 0) {
    res.status(400).json({ error: 'Con esas columnas no quedó ningún producto para cargar. Revisá la hoja, la fila de encabezados y las columnas.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    // Nadie más cambia el catálogo mientras se compara y se guarda.
    await client.query('lock table catalog_products in share row exclusive mode');
    // Mismo proveedor aunque lo escriban con otras mayúsculas.
    const same = await client.query(`select supplier from catalog_products where lower(supplier) = lower($1) group by supplier order by count(*) desc limit 1`, [input.proveedor]);
    const supplier: string = same.rows[0]?.supplier ?? input.proveedor;

    const codes = plan.products.map((p) => p.code);
    const { rows } = await client.query<Existing>(
      `select code, description, unit_price, cost_price, iva_rate, supplier, active from catalog_products where code = any($1::text[]) or supplier = $2`,
      [codes, supplier]
    );
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const inList = new Set(codes);

    const nuevos: PlannedProduct[] = [];
    const actualizar: { p: PlannedProduct; before: Existing }[] = [];
    const choques: { codigo: string; descripcion: string; proveedor_actual: string }[] = [];
    let sinCambios = 0;
    let reactivados = 0;
    for (const p of plan.products) {
      const ex = byCode.get(p.code);
      if (!ex) nuevos.push(p);
      else if (ex.supplier === supplier) {
        const same =
          ex.active &&
          ex.description === p.description &&
          Number(ex.unit_price) === p.unitPrice &&
          (ex.cost_price === null ? null : Number(ex.cost_price)) === p.costPrice &&
          Number(ex.iva_rate) === p.ivaRate;
        if (same) sinCambios++;
        else {
          if (!ex.active) reactivados++;
          actualizar.push({ p, before: ex });
        }
      } else choques.push({ codigo: p.code, descripcion: ex.description, proveedor_actual: ex.supplier ?? 'sin proveedor' });
    }
    const faltantes = rows.filter((r) => r.supplier === supplier && r.active && !inList.has(r.code));

    // Cambios de precio de los que ya estaban
    const changes = actualizar
      .filter(({ before }) => Number(before.unit_price) > 0)
      .map(({ p, before }) => ({ p, before, pct: (p.unitPrice / Number(before.unit_price) - 1) * 100 }));
    const up = changes.filter((c) => c.pct > 0.05).sort((a, b) => b.pct - a.pct);
    const down = changes.filter((c) => c.pct < -0.05).sort((a, b) => a.pct - b.pct);

    const skippedByReason: Record<string, number> = {};
    for (const s of plan.skipped) skippedByReason[s.motivo.replace(/ \(ya estaba.*$/, '')] = (skippedByReason[s.motivo.replace(/ \(ya estaba.*$/, '')] ?? 0) + 1;
    const bySheet: Record<string, number> = {};
    for (const p of plan.products) bySheet[p.sheet] = (bySheet[p.sheet] ?? 0) + 1;
    const sorted = [...plan.products].sort((a, b) => a.unitPrice - b.unitPrice);
    const examplesFrom = [plan.products[0], plan.products[Math.floor(plan.products.length / 2)], sorted[sorted.length - 1]];
    const examples = [...new Set(examplesFrom)].map((p) => example(p, byCode.get(p.code)?.supplier === supplier ? byCode.get(p.code) : undefined));
    const margins = plan.products.map((p) => (p.unitPrice / (p.costPrice * (1 + p.ivaRate / 100)) - 1) * 100).filter(Number.isFinite);

    const summary = {
      dry_run: input.dry_run,
      proveedor: supplier,
      archivo: file.name,
      productos_en_la_lista: plan.products.length,
      por_hoja: bySheet,
      nuevos: nuevos.length,
      actualizados: actualizar.length,
      reactivados,
      sin_cambios: sinCambios,
      ya_tenia_el_proveedor: rows.filter((r) => r.supplier === supplier && r.active).length,
      faltantes: faltantes.length,
      dados_de_baja: input.dar_de_baja_faltantes ? faltantes.length : 0,
      ...(faltantes.length && !input.dar_de_baja_faltantes ? { aviso_faltantes: `${faltantes.length} productos de ${supplier} no están en esta lista y quedan como están.` } : {}),
      choques_con_otros_proveedores: { cantidad: choques.length, ejemplos: choques.slice(0, 5) },
      salteados: { cantidad: plan.skipped.length, por_motivo: skippedByReason, ejemplos: plan.skipped.slice(0, 5) },
      filas_sin_codigo: plan.titleRows,
      ganancia_sobre_costo_con_iva: margins.length ? { minima: `${pct(Math.min(...margins))}%`, maxima: `${pct(Math.max(...margins))}%` } : null,
      ...(changes.length
        ? {
            cambios_de_precio: {
              suben: up.length,
              bajan: down.length,
              promedio: `${pct(changes.reduce((s, c) => s + c.pct, 0) / changes.length)}%`,
              mayores_subas: up.slice(0, 3).map((c) => ({ codigo: c.p.code, descripcion: c.p.description, antes: money.format(Number(c.before.unit_price)), ahora: money.format(c.p.unitPrice), cambio: `${pct(c.pct)}%` })),
            },
          }
        : {}),
      ejemplos: examples,
    };

    if (input.dry_run) {
      await client.query('rollback');
      res.json(summary);
      return;
    }

    const toRows = (list: PlannedProduct[]) =>
      JSON.stringify(list.map((p) => ({ code: p.code, description: p.description, unitPrice: p.unitPrice, costPrice: p.costPrice, ivaRate: p.ivaRate })));
    const recordset = `json_to_recordset($1::json) as x(code text, description text, "unitPrice" numeric, "costPrice" numeric, "ivaRate" numeric)`;
    if (nuevos.length) {
      await client.query(
        `insert into catalog_products (code, description, unit_price, cost_price, iva_rate, supplier, stock, active, updated_at)
         select x.code, x.description, x."unitPrice", x."costPrice", x."ivaRate", $2, 0, true, now() from ${recordset}`,
        [toRows(nuevos), supplier]
      );
    }
    if (actualizar.length) {
      await client.query(
        `update catalog_products c set description = x.description, unit_price = x."unitPrice", cost_price = x."costPrice",
           iva_rate = x."ivaRate", active = true, updated_at = now()
         from ${recordset} where c.code = x.code and c.supplier = $2`,
        [toRows(actualizar.map((a) => a.p)), supplier]
      );
    }
    if (input.dar_de_baja_faltantes && faltantes.length) {
      await client.query(`update catalog_products set active = false, updated_at = now() where supplier = $1 and code = any($2::text[])`, [
        supplier,
        faltantes.map((f) => f.code),
      ]);
    }
    await client.query('commit');
    const baja = input.dar_de_baja_faltantes && faltantes.length ? `, ${faltantes.length} dados de baja` : '';
    await logActivity(req.user!, 'catalog.supplier_list', `Cargó la lista de precios de ${supplier} (${file.name}): ${nuevos.length} nuevos, ${actualizar.length} actualizados${baja}`);
    res.json(summary);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});
