import { useEffect, useState } from 'react';
import {
  Archive,
  BatteryCharging,
  Car,
  Disc,
  Drill,
  Droplets,
  Flame,
  HardHat,
  Leaf,
  Paintbrush,
  Plug,
  Ruler,
  ShieldCheck,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface StoreProduct {
  code: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  /** Precio final (con IVA y con la oferta aplicada si tiene). */
  price: number;
  /** Precio sin la oferta (solo si está en oferta). */
  listPrice?: number;
  offerPct?: number;
  iva: number;
  featured: boolean;
  rank: number | null;
  image: string | null;
}

export interface StoreCategory {
  slug: string;
  name: string;
  count: number;
}

export interface StoreSettings {
  cuotas: number;
  transferPct: number;
  whatsapp: string;
  shippingNote: string;
}

export interface StoreCatalog {
  settings: StoreSettings;
  categories: StoreCategory[];
  products: StoreProduct[];
}

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

let cached: Promise<StoreCatalog> | null = null;

export function loadCatalog(): Promise<StoreCatalog> {
  if (!cached) {
    cached = fetch(`${API_URL ?? ''}/store/catalog`)
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json() as Promise<StoreCatalog>;
      })
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}

export function useCatalog(): { catalog: StoreCatalog | null; error: string } {
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setError('No pudimos cargar los productos. Revisá tu conexión y probá de nuevo.'));
    return () => {
      alive = false;
    };
  }, []);
  return { catalog, error };
}

export interface OrderInput {
  name: string;
  phone: string;
  email?: string;
  delivery: 'envio' | 'retiro';
  address?: string;
  city?: string;
  payment: 'tarjeta' | 'transferencia' | 'efectivo';
  notes?: string;
  website?: string;
  items: { code: string; qty: number }[];
}

export interface OrderResult {
  id: number;
  items: { code: string; name: string; qty: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  whatsapp: string;
}

export async function createOrder(input: OrderInput): Promise<OrderResult> {
  const r = await fetch(`${API_URL ?? ''}/store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'No pudimos registrar el pedido. Probá de nuevo o escribinos por WhatsApp.');
  return data as OrderResult;
}

// ─── Formatos ───────────────────────────────────────────────────────────────────

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const ars2 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number) => ars.format(n);
export const money2 = (n: number) => ars2.format(n);
/** Valor de cada cuota (sin interés): con centavos, como se cobra. */
export const cuota = (price: number, n: number) => Math.round((price / n) * 100) / 100;
/** Precio sin impuestos nacionales (Ley 27.743, Régimen de Transparencia Fiscal al Consumidor). */
export const withoutTaxes = (price: number, iva: number) => Math.round((price / (1 + iva / 100)) * 100) / 100;

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function slugify(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ─── Marcas y categorías ────────────────────────────────────────────────────────

export const BRANDS: { name: string; logo: string; tint: string }[] = [
  { name: 'Dowen Pagio', logo: '/marcas/dowen-pagio.svg', tint: '#fff4ee' },
  { name: 'Total', logo: '/marcas/total.webp', tint: '#eef8f8' },
  { name: 'Crossmaster', logo: '/marcas/crossmaster.png', tint: '#fffbea' },
  { name: 'BTA', logo: '/marcas/bta.png', tint: '#f4f4f4' },
  { name: 'Duroll', logo: '/marcas/duroll.webp', tint: '#f4f4f4' },
  { name: 'Andina', logo: '/marcas/andina.webp', tint: '#fdf0f2' },
  { name: 'Shimura', logo: '/marcas/shimura.webp', tint: '#fffbe6' },
  { name: 'Biassoni', logo: '/marcas/biassoni.png', tint: '#fdf0f0' },
];

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  'herramientas-electricas': Drill,
  'herramientas-a-bateria': BatteryCharging,
  'herramientas-de-mano': Wrench,
  'accesorios-y-consumibles': Disc,
  'jardin-y-poda': Leaf,
  'construccion-y-obra': HardHat,
  pinturas: Paintbrush,
  'compresores-y-aire': Wind,
  'generadores-y-bombas': Plug,
  soldadura: Flame,
  medicion: Ruler,
  'hidrolavadoras-y-limpieza': Droplets,
  'taller-y-automotor': Car,
  'cajas-y-almacenamiento': Archive,
  seguridad: ShieldCheck,
};

/** Color de cada rubro (íconos, tarjetas de categoría y encabezados de los listados). */
export const CATEGORY_COLOR: Record<string, string> = {
  'herramientas-electricas': '#f2550f',
  'herramientas-a-bateria': '#0d9488',
  'herramientas-de-mano': '#2563eb',
  'accesorios-y-consumibles': '#7c3aed',
  'jardin-y-poda': '#16a34a',
  'construccion-y-obra': '#d97706',
  pinturas: '#db2777',
  'compresores-y-aire': '#0284c7',
  'generadores-y-bombas': '#ca8a04',
  soldadura: '#dc2626',
  medicion: '#4f46e5',
  'hidrolavadoras-y-limpieza': '#0891b2',
  'taller-y-automotor': '#475569',
  'cajas-y-almacenamiento': '#b45309',
  seguridad: '#059669',
};
export const categoryColor = (slug: string | null | undefined) => (slug ? CATEGORY_COLOR[slug] : undefined) ?? '#fe4806';

/** Búsqueda: todas las palabras, en cualquier orden, sin importar acentos ni mayúsculas. */
export function searchProducts(products: StoreProduct[], q: string): StoreProduct[] {
  const words = normalize(q).split(/\s+/).filter(Boolean);
  if (!words.length) return products;
  return products.filter((p) => {
    const hay = normalize(`${p.name} ${p.brand ?? ''} ${p.code}`);
    return words.every((w) => hay.includes(w));
  });
}
