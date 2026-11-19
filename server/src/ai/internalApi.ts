import { config } from '../config.js';
import { signAiToken, type AuthClaims } from '../auth.js';

export class InternalApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Llama a la propia API (la misma que usa la interfaz) en nombre del usuario. Así cada cambio
 * que hace la IA pasa por las mismas validaciones, permisos de rol, transacciones y log de
 * actividad que un cambio hecho a mano — y la IA no tiene ningún otro camino para escribir.
 */
export function internalApi(user: AuthClaims) {
  const base = `http://127.0.0.1:${config.port}`;

  async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    // Token nuevo en cada llamada (dura 10 minutos y un turno largo de la IA puede durar más).
    const token = signAiToken(user);
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const message = res.status === 403 ? 'Tu usuario no tiene permiso para hacer esto.' : data.error ?? `Error ${res.status}`;
      throw new InternalApiError(message, res.status);
    }
    return data as T;
  }

  return {
    get: <T>(path: string) => call<T>('GET', path),
    post: <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
    patch: <T>(path: string, body?: unknown) => call<T>('PATCH', path, body ?? {}),
    del: <T>(path: string) => call<T>('DELETE', path),
  };
}

export type InternalApi = ReturnType<typeof internalApi>;
