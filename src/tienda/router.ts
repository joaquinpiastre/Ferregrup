import { createElement, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

// Navegación mínima de la tienda con la History API (sin dependencias): rutas limpias como
// /producto/taladro-... que se pueden compartir y que Vercel sirve con el index.html.

const EVENT = 'tn:navigate';

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
  if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

export function useLocation(): { path: string; query: URLSearchParams } {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', on);
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener(EVENT, on);
    };
  }, []);
  return { path: loc.path, query: new URLSearchParams(loc.search) };
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: ReactNode };

/** Enlace interno: navega sin recargar la página (pero sigue siendo un <a> real, se puede abrir en otra pestaña). */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  }
  return createElement('a', { href: to, onClick: handle, ...rest }, children);
}
