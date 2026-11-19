import { pool } from '../db/client.js';
import { arToday } from '../collections.js';
import type { StaffRole } from '../auth.js';
import { DEFAULT_MODEL_ID, findModel, type Effort } from './models.js';

export type AiAccess = 'off' | 'read' | 'write';
export type AiEffortSetting = 'auto' | Effort;
export type LimitMode = 'default' | 'none' | 'custom';

export interface AiSettings {
  enabled: boolean;
  defaultModel: string;
  effort: AiEffortSetting;
  requireConfirmation: boolean;
  globalMonthlyLimitUsd: number | null;
  defaultUserLimitUsd: number | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function getAiSettings(): Promise<AiSettings> {
  const { rows } = await pool.query(`select * from ai_settings where id = 1`);
  const r = rows[0] ?? {};
  return {
    enabled: r.enabled ?? true,
    defaultModel: findModel(r.default_model) ? r.default_model : DEFAULT_MODEL_ID,
    effort: r.effort ?? 'auto',
    requireConfirmation: r.require_confirmation ?? true,
    globalMonthlyLimitUsd: num(r.global_monthly_limit_usd),
    defaultUserLimitUsd: r.default_user_limit_usd === undefined ? 5 : num(r.default_user_limit_usd),
  };
}

export function defaultAccess(role: StaffRole): AiAccess {
  return role === 'admin' ? 'write' : 'read';
}

/** Inicio del mes en curso en hora de Argentina (UTC-3, sin horario de verano). */
export function monthStartMs(): number {
  return Date.parse(`${arToday().slice(0, 7)}-01T00:00:00-03:00`);
}

export async function spentThisMonth(staffId?: string): Promise<number> {
  const { rows } = await pool.query(
    `select coalesce(sum(cost_usd), 0) as total from ai_usage where created_at_ms >= $1 ${staffId ? 'and staff_id = $2' : ''}`,
    staffId ? [monthStartMs(), staffId] : [monthStartMs()]
  );
  return Number(rows[0].total);
}

export interface UserAiConfig {
  access: AiAccess;
  accessIsDefault: boolean;
  model: string;
  modelIsDefault: boolean;
  limitMode: LimitMode;
  /** Límite mensual efectivo en USD (null = sin límite). */
  limitUsd: number | null;
  customLimitUsd: number | null;
}

export async function getUserAiConfig(staffId: string, role: StaffRole, settings?: AiSettings): Promise<UserAiConfig> {
  const s = settings ?? (await getAiSettings());
  const { rows } = await pool.query(`select * from ai_user_settings where staff_id = $1`, [staffId]);
  const r = rows[0];
  const access: AiAccess = r?.access ?? defaultAccess(role);
  const model = findModel(r?.model) ? (r.model as string) : s.defaultModel;
  const limitMode: LimitMode = r?.limit_mode ?? 'default';
  const customLimitUsd = num(r?.monthly_limit_usd);
  const limitUsd = limitMode === 'none' ? null : limitMode === 'custom' ? customLimitUsd : s.defaultUserLimitUsd;
  return {
    access,
    accessIsDefault: !r?.access,
    model,
    modelIsDefault: !findModel(r?.model),
    limitMode,
    limitUsd,
    customLimitUsd,
  };
}

/** Devuelve el motivo por el que el usuario no puede seguir usando la IA, o null si puede. */
export async function budgetBlockReason(staffId: string, cfg: UserAiConfig, settings: AiSettings): Promise<string | null> {
  if (!settings.enabled) return 'El asistente de IA está desactivado por el administrador.';
  if (cfg.access === 'off') return 'El administrador no te habilitó el asistente de IA.';
  if (cfg.limitUsd !== null) {
    const spent = await spentThisMonth(staffId);
    if (spent >= cfg.limitUsd) {
      const limit = cfg.limitUsd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `Llegaste a tu límite mensual de IA (US$ ${limit}). Pedile al administrador que lo amplíe.`;
    }
  }
  if (settings.globalMonthlyLimitUsd !== null) {
    const total = await spentThisMonth();
    if (total >= settings.globalMonthlyLimitUsd) {
      return 'Se alcanzó el límite mensual de gasto en IA de todo el equipo. Avisale al administrador.';
    }
  }
  return null;
}
