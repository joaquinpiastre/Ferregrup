import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useCatalog, type StoreCatalog, type StoreProduct } from './data';

interface StoreApi {
  catalog: StoreCatalog | null;
  error: string;
  byCode: Map<string, StoreProduct>;
  bySlug: Map<string, StoreProduct>;
  categoryName: (slug: string | null | undefined) => string;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { catalog, error } = useCatalog();
  const value = useMemo<StoreApi>(() => {
    const products = catalog?.products ?? [];
    const names = new Map((catalog?.categories ?? []).map((c) => [c.slug, c.name]));
    return {
      catalog,
      error,
      byCode: new Map(products.map((p) => [p.code, p])),
      bySlug: new Map(products.map((p) => [p.slug, p])),
      categoryName: (slug) => (slug ? names.get(slug) ?? 'Productos' : 'Productos'),
    };
  }, [catalog, error]);
  return createElement(StoreContext.Provider, { value }, children);
}

export function useStore(): StoreApi {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}
