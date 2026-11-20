import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Carrito: solo códigos y cantidades (los precios salen siempre del catálogo actual).
// Se guarda en el navegador para que no se pierda al recargar.

export interface CartLine {
  code: string;
  qty: number;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (code: string, qty?: number) => void;
  setQty: (code: string, qty: number) => void;
  remove: (code: string) => void;
  clear: () => void;
}

const KEY = 'elmana_carrito_v1';
const CartContext = createContext<CartApi | null>(null);

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((l) => typeof l?.code === 'string' && Number.isInteger(l?.qty) && l.qty > 0).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(read);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* sin almacenamiento: el carrito vive solo en esta pestaña */
    }
  }, [lines]);

  const add = useCallback((code: string, qty = 1) => {
    setLines((ls) => {
      const found = ls.find((l) => l.code === code);
      if (found) return ls.map((l) => (l.code === code ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...ls, { code, qty: Math.min(99, qty) }].slice(-50);
    });
  }, []);
  const setQty = useCallback((code: string, qty: number) => {
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.code !== code) : ls.map((l) => (l.code === code ? { ...l, qty: Math.min(99, qty) } : l))));
  }, []);
  const remove = useCallback((code: string) => setLines((ls) => ls.filter((l) => l.code !== code)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartApi>(
    () => ({ lines, count: lines.reduce((s, l) => s + l.qty, 0), open, setOpen, add, setQty, remove, clear }),
    [lines, open, add, setQty, remove, clear]
  );
  return createElement(CartContext.Provider, { value }, children);
}

export function useCart(): CartApi {
  const c = useContext(CartContext);
  if (!c) throw new Error('useCart fuera de CartProvider');
  return c;
}
