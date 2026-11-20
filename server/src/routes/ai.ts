import Anthropic from '@anthropic-ai/sdk';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type StaffRole } from '../auth.js';
import { pool } from '../db/client.js';
import { logActivity } from '../activityLog.js';
import { AI_MODELS, findModel, typicalQuestionCostUsd } from '../ai/models.js';
import { getAiSettings, getUserAiConfig, monthStartMs, spentThisMonth, defaultAccess } from '../ai/settings.js';
import { buildSystemPrompt } from '../ai/prompt.js';
import {
  isRunning,
  loadConversation,
  loadMessages,
  resetAnthropicClient,
  resolvePending,
  sendUserMessage,
  withConversationLock,
  type AgentEvent,
} from '../ai/agent.js';
import { toChatItems } from '../ai/display.js';
import { uploadedFileNames } from './files.js';

export const aiRouter = Router();

const apiKeyConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Las rutas de la IA son solo para personas: el token interno que usa la IA para operar
// sobre los datos no puede usarse para hablar con la IA ni para cambiar su configuración.
function rejectAiToken(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.via === 'ia') {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  next();
}

aiRouter.use('/ai', requireAuth, rejectAiToken);

// ─── Estado para el usuario ─────────────────────────────────────────────────────

aiRouter.get('/ai/me', async (req, res) => {
  const user = req.user!;
  const settings = await getAiSettings();
  const cfg = await getUserAiConfig(user.sub, user.role, settings);
  const model = findModel(cfg.model);
  res.json({
    enabled: settings.enabled && cfg.access !== 'off',
    globallyEnabled: settings.enabled,
    access: cfg.access,
    apiConfigured: apiKeyConfigured(),
    requireConfirmation: settings.requireConfirmation,
    model: model ? { id: model.id, name: model.name } : null,
    spentUsd: await spentThisMonth(user.sub),
    limitUsd: cfg.limitUsd,
  });
});

// ─── Conversaciones ─────────────────────────────────────────────────────────────

aiRouter.get('/ai/conversations', async (req, res) => {
  const { rows } = await pool.query(
    `select id, title, updated_at_ms as "updatedAt", pending is not null as "hasPending"
     from ai_conversations where staff_id = $1 order by updated_at_ms desc limit 100`,
    [req.user!.sub]
  );
  res.json({ conversations: rows.map((r) => ({ ...r, updatedAt: Number(r.updatedAt) })) });
});

aiRouter.post('/ai/conversations', async (req, res) => {
  const user = req.user!;
  const id = `aic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  await pool.query(
    `insert into ai_conversations (id, staff_id, staff_role, system_prompt, created_at_ms, updated_at_ms)
     values ($1,$2,$3,$4,$5,$5)`,
    [id, user.sub, user.role, buildSystemPrompt(user), now]
  );
  res.json({ id });
});

aiRouter.get('/ai/conversations/:id', async (req, res) => {
  const conv = await loadConversation(req.params.id, req.user!.sub);
  if (!conv) {
    res.status(404).json({ error: 'Conversación no encontrada.' });
    return;
  }
  const rows = await loadMessages(conv.id);
  res.json({
    id: conv.id,
    title: conv.title,
    items: toChatItems(rows, conv),
    pending: conv.pending?.actions.map(({ id, title, details, warning }) => ({ id, title, details, warning })) ?? null,
    contextTokens: conv.context_tokens,
    running: isRunning(conv.id),
    // Si cambió el rol del usuario, la conversación queda con las herramientas del rol viejo.
    roleChanged: conv.staff_role !== req.user!.role,
  });
});

aiRouter.delete('/ai/conversations/:id', async (req, res) => {
  if (isRunning(req.params.id)) {
    res.status(409).json({ error: 'Esperá a que la IA termine de responder.' });
    return;
  }
  const del = await pool.query(`delete from ai_conversations where id = $1 and staff_id = $2`, [req.params.id, req.user!.sub]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Conversación no encontrada.' });
    return;
  }
  res.json({ ok: true });
});

/** Respuesta en streaming: una línea JSON por evento (texto, herramientas, confirmación, consumo). */
function openStream(res: Response): (event: AgentEvent) => void {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  let open = true;
  // Si el usuario cierra la pestaña la IA termina igual el turno (así el historial queda
  // consistente); solo se deja de escribir.
  res.on('close', () => {
    open = false;
  });
  return (event) => {
    if (open) res.write(`${JSON.stringify(event)}\n`);
  };
}

async function streamRun(req: Request, res: Response, run: (emit: (e: AgentEvent) => void) => Promise<void>): Promise<void> {
  const conv = await loadConversation(req.params.id, req.user!.sub);
  if (!conv) {
    res.status(404).json({ error: 'Conversación no encontrada.' });
    return;
  }
  if (conv.staff_role !== req.user!.role) {
    res.status(409).json({ error: 'Tu rol cambió desde que empezaste esta conversación. Empezá una nueva.' });
    return;
  }
  if (isRunning(conv.id)) {
    res.status(409).json({ error: 'La IA todavía está respondiendo en esta conversación.' });
    return;
  }
  await withConversationLock(conv.id, async () => {
    const emit = openStream(res);
    try {
      await run(emit);
    } finally {
      emit({ type: 'done' });
      res.end();
    }
  });
}

const messageSchema = z
  .object({
    text: z.string().trim().max(8000).default(''),
    // Ids de archivos subidos antes con POST /files (por ahora, listas de precios).
    attachments: z.array(z.string().min(1).max(80)).max(3).default([]),
  })
  .refine((m) => m.text.length > 0 || m.attachments.length > 0);

aiRouter.post('/ai/conversations/:id/messages', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Escribí un mensaje (máximo 8000 caracteres).' });
    return;
  }
  const attachments = await uploadedFileNames(parsed.data.attachments, req.user!.sub);
  if (attachments.length !== parsed.data.attachments.length) {
    res.status(400).json({ error: 'No encontré alguno de los archivos adjuntos. Volvé a adjuntarlo.' });
    return;
  }
  await streamRun(req, res, async (emit) => {
    const conv = (await loadConversation(req.params.id, req.user!.sub))!;
    await sendUserMessage(conv, req.user!, parsed.data.text, emit, attachments);
  });
});

const confirmSchema = z.object({ approve: z.boolean() });

aiRouter.post('/ai/conversations/:id/confirm', async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.' });
    return;
  }
  await streamRun(req, res, async (emit) => {
    const conv = (await loadConversation(req.params.id, req.user!.sub))!;
    await resolvePending(conv, req.user!, parsed.data.approve, emit);
  });
});

// ─── Administración ─────────────────────────────────────────────────────────────

const adminOnly = requireRole('admin');

aiRouter.get('/ai/admin/overview', adminOnly, async (_req, res) => {
  const settings = await getAiSettings();
  const monthStart = monthStartMs();
  const prevStart = Date.parse(new Date(new Date(monthStart).getTime() - 15 * 86_400_000).toISOString().slice(0, 7) + '-01T00:00:00-03:00');

  const [{ rows: staff }, { rows: userSettings }, { rows: usage }, { rows: byModel }] = await Promise.all([
    pool.query(`select id, name, role, active from staff order by active desc, role, name`),
    pool.query(`select * from ai_user_settings`),
    pool.query(
      `select staff_id,
         coalesce(sum(cost_usd) filter (where created_at_ms >= $1), 0) as month,
         coalesce(sum(cost_usd) filter (where created_at_ms >= $2 and created_at_ms < $1), 0) as prev,
         count(*) filter (where created_at_ms >= $1)::int as calls,
         max(created_at_ms) as last
       from ai_usage group by staff_id`,
      [monthStart, prevStart]
    ),
    pool.query(
      `select model, coalesce(sum(cost_usd), 0) as cost, count(*)::int as calls,
         coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output
       from ai_usage where created_at_ms >= $1 group by model order by cost desc`,
      [monthStart]
    ),
  ]);
  const settingsBy = new Map(userSettings.map((r) => [r.staff_id as string, r]));
  const usageBy = new Map(usage.map((r) => [r.staff_id as string, r]));

  const users = await Promise.all(
    staff.map(async (s) => {
      const cfg = await getUserAiConfig(s.id, s.role as StaffRole, settings);
      const u = usageBy.get(s.id);
      const r = settingsBy.get(s.id);
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        active: s.active,
        access: r?.access ?? 'default',
        effectiveAccess: cfg.access,
        defaultAccess: defaultAccess(s.role as StaffRole),
        model: r?.model && findModel(r.model) ? r.model : null,
        effectiveModel: cfg.model,
        limitMode: cfg.limitMode,
        customLimitUsd: cfg.customLimitUsd,
        limitUsd: cfg.limitUsd,
        spentUsd: Number(u?.month ?? 0),
        spentPrevUsd: Number(u?.prev ?? 0),
        callsThisMonth: Number(u?.calls ?? 0),
        lastUsedAt: u?.last ? Number(u.last) : null,
      };
    })
  );

  res.json({
    settings,
    apiConfigured: apiKeyConfigured(),
    models: AI_MODELS.map((m) => ({ ...m, typicalQuestionUsd: typicalQuestionCostUsd(m) })),
    users,
    totals: {
      spentUsd: users.reduce((s, u) => s + u.spentUsd, 0),
      spentPrevUsd: users.reduce((s, u) => s + u.spentPrevUsd, 0),
    },
    byModel: byModel.map((r) => ({
      model: r.model,
      name: findModel(r.model)?.name ?? r.model,
      costUsd: Number(r.cost),
      calls: r.calls,
      inputTokens: Number(r.input),
      outputTokens: Number(r.output),
    })),
  });
});

const usd = z.number().nonnegative().max(100_000).nullable();
const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  defaultModel: z.string().refine((id) => !!findModel(id), 'Modelo desconocido.').optional(),
  effort: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  requireConfirmation: z.boolean().optional(),
  globalMonthlyLimitUsd: usd.optional(),
  defaultUserLimitUsd: usd.optional(),
});

aiRouter.put('/ai/admin/settings', adminOnly, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const s = { ...(await getAiSettings()), ...parsed.data };
  await pool.query(
    `update ai_settings set enabled = $1, default_model = $2, effort = $3, require_confirmation = $4,
       global_monthly_limit_usd = $5, default_user_limit_usd = $6, updated_at = now() where id = 1`,
    [s.enabled, s.defaultModel, s.effort, s.requireConfirmation, s.globalMonthlyLimitUsd, s.defaultUserLimitUsd]
  );
  const model = findModel(s.defaultModel)!;
  await logActivity(
    req.user!,
    'ai.settings',
    `Configuró la IA: ${s.enabled ? 'activada' : 'desactivada'}, modelo ${model.name}, confirmar cambios ${s.requireConfirmation ? 'sí' : 'no'}`
  );
  res.json({ ok: true, settings: s });
});

const userSettingsSchema = z.object({
  access: z.enum(['default', 'off', 'read', 'write']),
  model: z.string().nullable().refine((id) => id === null || !!findModel(id), 'Modelo desconocido.'),
  limitMode: z.enum(['default', 'none', 'custom']),
  monthlyLimitUsd: usd.optional(),
});

aiRouter.put('/ai/admin/users/:id', adminOnly, async (req, res) => {
  const parsed = userSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
    return;
  }
  const p = parsed.data;
  if (p.limitMode === 'custom' && (p.monthlyLimitUsd === null || p.monthlyLimitUsd === undefined)) {
    res.status(400).json({ error: 'Indicá el límite mensual en dólares.' });
    return;
  }
  const { rows } = await pool.query(`select name from staff where id = $1`, [req.params.id]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }
  await pool.query(
    `insert into ai_user_settings (staff_id, access, model, limit_mode, monthly_limit_usd, updated_at)
     values ($1,$2,$3,$4,$5,now())
     on conflict (staff_id) do update set access = excluded.access, model = excluded.model,
       limit_mode = excluded.limit_mode, monthly_limit_usd = excluded.monthly_limit_usd, updated_at = now()`,
    [req.params.id, p.access === 'default' ? null : p.access, p.model, p.limitMode, p.limitMode === 'custom' ? p.monthlyLimitUsd : null]
  );
  await logActivity(req.user!, 'ai.user_settings', `Configuró la IA de ${rows[0].name}`);
  res.json({ ok: true });
});

/** Prueba la clave de API y lista qué modelos tiene disponibles la cuenta de Anthropic. */
aiRouter.post('/ai/admin/test', adminOnly, async (_req, res) => {
  resetAnthropicClient();
  try {
    const client = new Anthropic();
    const available: string[] = [];
    for await (const m of client.models.list({ limit: 100 })) available.push(m.id);
    res.json({
      ok: true,
      models: AI_MODELS.map((m) => ({ id: m.id, available: available.some((a) => a === m.id || a.startsWith(`${m.id}-`)) })),
    });
  } catch (err) {
    const message =
      err instanceof Anthropic.AuthenticationError
        ? 'La clave de API no es válida.'
        : err instanceof Anthropic.APIConnectionError
          ? 'No se pudo conectar con Anthropic.'
          : err instanceof Anthropic.APIError
            ? `Anthropic respondió ${err.status}: ${err.message}`
            : !apiKeyConfigured()
              ? 'Falta la variable ANTHROPIC_API_KEY en el servidor.'
              : err instanceof Error
                ? err.message
                : String(err);
    res.json({ ok: false, error: message });
  }
});
