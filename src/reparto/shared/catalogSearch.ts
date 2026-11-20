import type { CatalogProduct } from '../types';

// Búsqueda en el catálogo, compartida por todas las pantallas que eligen productos.
// Con miles de productos (varias listas de proveedores), pasar cada descripción a minúsculas en
// cada tecla hacía lenta la búsqueda: el texto de cada producto se arma una sola vez.

/** Texto de búsqueda de cada producto (descripción y código, en minúsculas), en el mismo orden. */
export function buildSearchIndex(products: CatalogProduct[]): string[] {
  return products.map((p) => `${p.description} ${p.code}`.toLowerCase());
}

/**
 * Productos que tienen todas las palabras buscadas, en cualquier orden ("taladro bosch" encuentra
 * "BOSCH HERRAMIENTA ELECTRICA TALADRO GBM 50-2"). Sin palabras devuelve todos (los que pasen `keep`).
 */
export function searchProducts(
  products: CatalogProduct[],
  index: string[],
  query: string,
  { limit = Infinity, keep }: { limit?: number; keep?: (p: CatalogProduct) => boolean } = {}
): CatalogProduct[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: CatalogProduct[] = [];
  for (let i = 0; i < products.length && out.length < limit; i++) {
    const p = products[i];
    if (keep && !keep(p)) continue;
    if (words.every((w) => index[i].includes(w))) out.push(p);
  }
  return out;
}
