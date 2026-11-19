import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/client.js';
import type { AuthClaims, StaffRole } from '../auth.js';
import { DEFAULT_MODEL_ID, findModel, usageLines } from './models.js';
import { budgetBlockReason, getAiSettings, getUserAiConfig, spentThisMonth, type AiSettings, type UserAiConfig } from './settings.js';
import { anthropicTools, findTool, toolLabel, ToolError, type ToolContext } from './tools.js';
import { internalApi, InternalApiError } from './internalApi.js';
import { contextBlock } from './prompt.js';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;
type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
type ToolResultParam = Anthropic.Beta.BetaToolResultBlockParam;

// ─── Eventos que se le streamean al navegador (una línea JSON por evento) ─────

export interface ConfirmAction {
  id: string;
  title: string;
  details: string[];
  warning?: string;
}

export type AgentEvent =
  | { type: 'iteration' }
  | { type: 'retry' }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; status: ToolStatus; summary: string }
  | { type: 'confirm'; actions: ConfirmAction[] }
  | { type: 'usage'; costUsd: number; spentUsd: number; limitUsd: number | null }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type Emit = (event: AgentEvent) => void;

export type ToolStatus = 'ok' | 'error' | 'cancelado';

interface ToolMeta {
  status: ToolStatus;
  summary: string;
}

interface PendingAction extends ConfirmAction {
  name: string;
  input: unknown;
}

interface PendingState {
  /** Ids de los tool_use del turno, en orden: los resultados se devuelven en ese orden. */
  order: string[];
  actions: PendingAction[];
  /** Resultados ya resueltos del mismo turno (consultas, errores de validación). */
  ready: ToolResultParam[];
  readyMeta: Record<string, ToolMeta>;
}

export interface ConversationRow {
  id: string;
  staff_id: string;
  staff_role: StaffRole;
  title: string;
  system_prompt: string;
  pending: PendingState | null;
  context_tokens: number;
}

export interface MessageRow {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: MessageParam['content'];
  meta: { hidden?: number[]; tools?: Record<string, ToolMeta> } | null;
  created_at_ms: string;
}

const MAX_ITERATIONS = 15;
// Alcanza para la respuesta más el razonamiento (que también cuenta en max_tokens).
const MAX_TOKENS = 32_000;
const MAX_RESULT_CHARS = 60_000;

let anthropic: Anthropic | null = null;
function client(): Anthropic {
  // Toma la clave de ANTHROPIC_API_KEY (variable de entorno del servidor).
  anthropic ??= new Anthropic();
  return anthropic;
}

export function resetAnthropicClient(): void {
  anthropic = null;
}

// Una sola ejecución por conversación a la vez (dos pedidos simultáneos mezclarían el historial).
const running = new Set<string>();

export function isRunning(conversationId: string): boolean {
  return running.has(conversationId);
}

export async function withConversationLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  running.add(conversationId);
  try {
    return await fn();
  } finally {
    running.delete(conversationId);
  }
}

// ─── Persistencia ───────────────────────────────────────────────────────────────

export async function loadConversation(id: string, staffId: string): Promise<ConversationRow | null> {
  const { rows } = await pool.query(`select * from ai_conversations where id = $1 and staff_id = $2`, [id, staffId]);
  return (rows[0] as ConversationRow | undefined) ?? null;
}

export async function loadMessages(conversationId: string): Promise<MessageRow[]> {
  const { rows } = await pool.query(
    `select id, role, content, meta, created_at_ms from ai_messages where conversation_id = $1 order by id`,
    [conversationId]
  );
  return rows as MessageRow[];
}

async function appendMessage(conversationId: string, role: MessageRow['role'], content: unknown, meta?: MessageRow['meta']) {
  const now = Date.now();
  await pool.query(
    `insert into ai_messages (conversation_id, role, content, meta, created_at_ms) values ($1,$2,$3,$4,$5)`,
    [conversationId, role, JSON.stringify(content), meta ? JSON.stringify(meta) : null, now]
  );
  await pool.query(`update ai_conversations set updated_at_ms = $2 where id = $1`, [conversationId, now]);
}

async function setPending(conversationId: string, pending: PendingState | null) {
  await pool.query(`update ai_conversations set pending = $2 where id = $1`, [conversationId, pending ? JSON.stringify(pending) : null]);
}

const toParam = (m: MessageRow) => ({ role: m.role, content: m.content }) as MessageParam;

function toolUsesOf(content: MessageParam['content']): ToolUseBlock[] {
  return Array.isArray(content) ? (content.filter((b) => b.type === 'tool_use') as unknown as ToolUseBlock[]) : [];
}

// ─── Utilidades ─────────────────────────────────────────────────────────────────

function resultBlock(toolUseId: string, data: unknown, isError: boolean): ToolResultParam {
  let text = typeof data === 'string' ? data : JSON.stringify(data);
  if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}… [resultado recortado: pedí menos filas]`;
  return { type: 'tool_result', tool_use_id: toolUseId, content: text, ...(isError ? { is_error: true } : {}) };
}

/**
 * Si un filtro de seguridad cortó la respuesta a mitad y otro modelo la continuó, la API pide
 * que al reenviar el turno se omitan los bloques internos (razonamiento, llamadas a
 * herramientas) previos al último bloque `fallback`, dejando ese bloque en su lugar.
 */
function sanitizeFallback(content: ContentBlock[]): ContentBlock[] {
  const last = content.map((b) => b.type).lastIndexOf('fallback');
  if (last < 0) return content;
  return content.filter((b, i) => i >= last || b.type === 'text' || b.type === 'fallback');
}

function friendlyApiError(err: unknown, modelName: string): string {
  if (err instanceof Anthropic.AuthenticationError) return 'La clave de la API de Anthropic no es válida. El administrador tiene que revisarla.';
  if (err instanceof Anthropic.PermissionDeniedError) return `La cuenta de Anthropic no tiene permiso para usar ${modelName}.`;
  if (err instanceof Anthropic.NotFoundError) return `El modelo ${modelName} no está disponible para esta cuenta de Anthropic. El administrador puede elegir otro.`;
  if (err instanceof Anthropic.RateLimitError) return 'La IA está recibiendo demasiados pedidos. Probá de nuevo en un minuto.';
  if (err instanceof Anthropic.BadRequestError) return `La IA rechazó el pedido: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con el servicio de IA. Probá de nuevo en un momento.';
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || (err.status ?? 0) >= 500) return 'El servicio de IA está saturado o con problemas. Probá de nuevo en un momento.';
    return `Error del servicio de IA (${err.status ?? '?'}): ${err.message}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/api.?key|credential|auth/i.test(message)) return 'Falta configurar la clave de la API de Anthropic (ANTHROPIC_API_KEY) en el servidor.';
  return `Error inesperado de la IA: ${message}`;
}

// ─── Ejecución de herramientas ──────────────────────────────────────────────────

async function runTool(name: string, input: unknown, ctx: ToolContext, role: StaffRole): Promise<{ block: ToolResultParam; meta: ToolMeta }> {
  const tool = findTool(name, role)!;
  try {
    const out = await tool.run(input as never, ctx);
    return { block: resultBlock('', out.data, false), meta: { status: 'ok', summary: out.summary } };
  } catch (e) {
    const expected = e instanceof ToolError || e instanceof InternalApiError;
    if (!expected) console.error(`Error ejecutando la herramienta de IA ${name}:`, e);
    const message = expected ? (e as Error).message : `Error interno: ${e instanceof Error ? e.message : e}`;
    return { block: resultBlock('', { error: message }, true), meta: { status: 'error', summary: message } };
  }
}

const withId = (b: ToolResultParam, id: string): ToolResultParam => ({ ...b, tool_use_id: id });

const CANCELLED_TEXT = 'El usuario canceló este cambio y no se aplicó. No lo vuelvas a intentar salvo que te lo pida de nuevo.';
const SUPERSEDED_TEXT = 'No se ejecutó: el usuario escribió un mensaje nuevo en lugar de confirmar este cambio.';

// ─── Bucle principal ────────────────────────────────────────────────────────────

interface RunContext {
  conv: ConversationRow;
  user: AuthClaims;
  settings: AiSettings;
  cfg: UserAiConfig;
  emit: Emit;
}

async function recordUsage(rc: RunContext, message: Anthropic.Beta.BetaMessage, requestedModel: string): Promise<number> {
  const lines = usageLines(message, requestedModel);
  let cost = 0;
  for (const l of lines) {
    cost += l.costUsd;
    await pool.query(
      `insert into ai_usage (staff_id, conversation_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, created_at_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [rc.user.sub, rc.conv.id, l.model, l.inputTokens, l.outputTokens, l.cacheReadTokens, l.cacheWriteTokens, l.costUsd, Date.now()]
    );
  }
  const last = lines[lines.length - 1];
  const contextTokens = last ? last.inputTokens + last.cacheReadTokens + last.cacheWriteTokens + last.outputTokens : 0;
  await pool.query(`update ai_conversations set context_tokens = $2 where id = $1`, [rc.conv.id, contextTokens]);
  return cost;
}

async function runLoop(rc: RunContext): Promise<void> {
  const { conv, user, settings, cfg, emit } = rc;
  const model = findModel(cfg.model) ?? findModel(DEFAULT_MODEL_ID)!;
  const effort = settings.effort === 'auto' ? model.defaultEffort : settings.effort;
  // La lista de herramientas depende solo del rol con el que se creó la conversación, así
  // el prefijo (system + tools + mensajes anteriores) no cambia entre pedidos.
  const tools = anthropicTools(conv.staff_role);
  const messages = (await loadMessages(conv.id)).map(toParam);
  const ctx: ToolContext = { user, api: internalApi(user) };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (iteration > 0) {
      const blocked = await budgetBlockReason(user.sub, cfg, settings);
      if (blocked) {
        emit({ type: 'error', message: blocked });
        return;
      }
    }
    emit({ type: 'iteration' });

    let message: Anthropic.Beta.BetaMessage;
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = client().beta.messages.stream({
          model: model.id,
          max_tokens: MAX_TOKENS,
          system: conv.system_prompt,
          messages,
          tools,
          // Si el prefijo de una conversación vieja cambió (por ejemplo, tras actualizar el
          // sistema), la API descarta el razonamiento viejo en lugar de fallar.
          thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
          output_config: { effort },
          cache_control: { type: 'ephemeral' },
          betas: ['thinking-binding-controls-2026-08-01', ...(model.serverFallback ? (['server-side-fallback-2026-07-01'] as const) : [])],
          // Si un filtro de seguridad rechaza el pedido por error, la API lo reintenta sola en
          // el modelo que Anthropic recomienda para ese caso.
          ...(model.serverFallback ? { fallbacks: 'default' as const } : {}),
        });
        stream.on('text', (delta) => emit({ type: 'text', text: delta }));
        stream.on('streamEvent', (event) => {
          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            const b = event.content_block;
            emit({ type: 'tool_start', id: b.id, name: b.name, label: toolLabel(b.name) });
          }
        });
        message = await stream.finalMessage();
        break;
      } catch (err) {
        // Los errores de la API se informan; un JSON de herramienta imposible de leer o una
        // conexión cortada a mitad se reintentan (máximo 2 veces seguidas).
        if (err instanceof Anthropic.APIError || attempt >= 2) throw err;
        console.warn('Reintentando turno de IA:', err);
        emit({ type: 'retry' });
      }
    }

    const costUsd = await recordUsage(rc, message, model.id);
    emit({ type: 'usage', costUsd, spentUsd: await spentThisMonth(user.sub), limitUsd: cfg.limitUsd });

    const content = sanitizeFallback(message.content);
    const toolUses = content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    const stop = message.stop_reason;

    // Una negativa o un corte por longitud pueden dejar una llamada a herramienta a medio
    // escribir: nunca se ejecuta, y del turno solo se guarda el texto.
    if (stop === 'refusal' || (stop === 'max_tokens' && toolUses.length > 0)) {
      const text = content.filter((b) => b.type === 'text' && b.text.trim());
      if (text.length) {
        await appendMessage(conv.id, 'assistant', text);
      }
      emit({
        type: 'error',
        message:
          stop === 'refusal'
            ? 'La IA no pudo responder este pedido (lo bloqueó un filtro de seguridad). Probá reformularlo.'
            : 'La respuesta quedó demasiado larga y se cortó. Probá pedir menos cosas a la vez.',
      });
      return;
    }
    if (content.length === 0) {
      emit({ type: 'error', message: 'La IA devolvió una respuesta vacía. Probá de nuevo.' });
      return;
    }

    await appendMessage(conv.id, 'assistant', content);
    messages.push({ role: 'assistant', content: content as Anthropic.Beta.BetaContentBlockParam[] });

    if (stop === 'pause_turn') continue;
    if (toolUses.length === 0) return;

    const ready: ToolResultParam[] = [];
    const readyMeta: Record<string, ToolMeta> = {};
    const actions: PendingAction[] = [];

    const settle = (id: string, block: ToolResultParam, meta: ToolMeta) => {
      ready.push(withId(block, id));
      readyMeta[id] = meta;
      emit({ type: 'tool_end', id, status: meta.status, summary: meta.summary });
    };

    for (const tu of toolUses) {
      const tool = findTool(tu.name, conv.staff_role);
      if (!tool) {
        const msg = `La herramienta ${tu.name} no está disponible para este usuario.`;
        settle(tu.id, resultBlock(tu.id, { error: msg }, true), { status: 'error', summary: msg });
        continue;
      }
      // Con eager_input_streaming la API no valida el JSON: se valida acá antes de ejecutar.
      const parsed = tool.schema.safeParse(tu.input);
      if (!parsed.success) {
        const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
        settle(tu.id, resultBlock(tu.id, { error: 'INVALID_INPUT', detalle: detail, recibido: tu.input }, true), {
          status: 'error',
          summary: 'Datos inválidos',
        });
        continue;
      }
      if (tool.kind === 'read') {
        const r = await runTool(tu.name, parsed.data, ctx, conv.staff_role);
        settle(tu.id, r.block, r.meta);
        continue;
      }
      if (cfg.access !== 'write') {
        const msg = 'El usuario tiene permiso de IA "solo consultas": no podés hacer cambios. Un administrador se lo puede habilitar.';
        settle(tu.id, resultBlock(tu.id, { error: msg }, true), { status: 'error', summary: 'Sin permiso para hacer cambios' });
        continue;
      }
      let preview;
      try {
        preview = await tool.preview!(parsed.data as never, ctx);
      } catch (e) {
        const msg = e instanceof ToolError || e instanceof InternalApiError ? e.message : `Error interno: ${e instanceof Error ? e.message : e}`;
        if (!(e instanceof ToolError || e instanceof InternalApiError)) console.error(`Error en la vista previa de ${tu.name}:`, e);
        preview = { ok: false as const, error: msg };
      }
      if (!preview.ok) {
        settle(tu.id, resultBlock(tu.id, { error: preview.error }, true), { status: 'error', summary: preview.error });
        continue;
      }
      if (settings.requireConfirmation) {
        actions.push({ id: tu.id, name: tu.name, input: parsed.data, title: preview.title, details: preview.details, warning: preview.warning });
        continue;
      }
      const r = await runTool(tu.name, parsed.data, ctx, conv.staff_role);
      settle(tu.id, r.block, r.meta);
    }

    if (actions.length > 0) {
      await setPending(conv.id, { order: toolUses.map((t) => t.id), actions, ready, readyMeta });
      emit({ type: 'confirm', actions: actions.map(({ id, title, details, warning }) => ({ id, title, details, warning })) });
      return;
    }

    const ordered = toolUses.map((t) => ready.find((r) => r.tool_use_id === t.id)!);
    await appendMessage(conv.id, 'user', ordered, { tools: readyMeta });
    messages.push({ role: 'user', content: ordered });
  }
  emit({ type: 'error', message: 'La IA necesitó demasiados pasos para este pedido. Probá dividirlo en partes más chicas.' });
}

async function prepare(conv: ConversationRow, user: AuthClaims, emit: Emit): Promise<RunContext | null> {
  const settings = await getAiSettings();
  const cfg = await getUserAiConfig(user.sub, user.role, settings);
  const blocked = await budgetBlockReason(user.sub, cfg, settings);
  if (blocked) {
    emit({ type: 'error', message: blocked });
    return null;
  }
  return { conv, user, settings, cfg, emit };
}

async function guarded(rc: RunContext): Promise<void> {
  try {
    await runLoop(rc);
  } catch (err) {
    const modelName = findModel(rc.cfg.model)?.name ?? rc.cfg.model;
    if (!(err instanceof Anthropic.APIError)) console.error('Error en el asistente de IA:', err);
    rc.emit({ type: 'error', message: friendlyApiError(err, modelName) });
  }
}

/** Mensaje nuevo del usuario. Si había cambios esperando confirmación, quedan descartados. */
export async function sendUserMessage(conv: ConversationRow, user: AuthClaims, text: string, emit: Emit): Promise<void> {
  const rc = await prepare(conv, user, emit);
  if (!rc) return;

  const history = await loadMessages(conv.id);
  const last = history[history.length - 1];
  const prefix: ToolResultParam[] = [];
  const toolsMeta: Record<string, ToolMeta> = {};
  // Toda llamada a herramienta necesita su resultado antes del próximo mensaje: los cambios
  // sin confirmar (o un turno interrumpido) se cierran como no ejecutados.
  if (last?.role === 'assistant') {
    const pending = conv.pending;
    for (const tu of toolUsesOf(last.content)) {
      const done = pending?.ready.find((r) => r.tool_use_id === tu.id);
      if (done) {
        prefix.push(done);
        toolsMeta[tu.id] = pending!.readyMeta[tu.id];
      } else {
        prefix.push(resultBlock(tu.id, SUPERSEDED_TEXT, true));
        toolsMeta[tu.id] = { status: 'cancelado', summary: 'No se confirmó' };
      }
    }
  }
  const content = [...prefix, { type: 'text', text: contextBlock(rc.cfg.access) }, { type: 'text', text }];
  await appendMessage(conv.id, 'user', content, { hidden: [prefix.length], ...(prefix.length ? { tools: toolsMeta } : {}) });
  await setPending(conv.id, null);
  if (conv.title === 'Nueva conversación') {
    const title = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    await pool.query(`update ai_conversations set title = $2 where id = $1`, [conv.id, title || 'Conversación']);
  }
  await guarded(rc);
}

/** El usuario confirmó (o canceló) los cambios propuestos por la IA. */
export async function resolvePending(conv: ConversationRow, user: AuthClaims, approve: boolean, emit: Emit): Promise<void> {
  const pending = conv.pending;
  if (!pending) {
    emit({ type: 'error', message: 'No hay cambios esperando confirmación.' });
    return;
  }
  const settings = await getAiSettings();
  const cfg = await getUserAiConfig(user.sub, user.role, settings);
  const ctx: ToolContext = { user, api: internalApi(user) };

  const results: ToolResultParam[] = [];
  const meta: Record<string, ToolMeta> = {};
  for (const id of pending.order) {
    const done = pending.ready.find((r) => r.tool_use_id === id);
    if (done) {
      results.push(done);
      meta[id] = pending.readyMeta[id];
      continue;
    }
    const action = pending.actions.find((a) => a.id === id);
    if (!action) continue;
    let block: ToolResultParam;
    let m: ToolMeta;
    if (!approve) {
      block = resultBlock(id, CANCELLED_TEXT, true);
      m = { status: 'cancelado', summary: 'Cancelado por el usuario' };
    } else if (cfg.access !== 'write' || !settings.enabled) {
      const msg = 'El permiso para hacer cambios con la IA se quitó antes de confirmar; no se aplicó.';
      block = resultBlock(id, { error: msg }, true);
      m = { status: 'error', summary: msg };
    } else {
      const tool = findTool(action.name, conv.staff_role);
      const parsed = tool?.schema.safeParse(action.input);
      if (!tool || !parsed?.success) {
        block = resultBlock(id, { error: 'Los datos del cambio ya no son válidos.' }, true);
        m = { status: 'error', summary: 'Datos inválidos' };
      } else {
        emit({ type: 'tool_start', id, name: action.name, label: toolLabel(action.name) });
        const r = await runTool(action.name, parsed.data, ctx, conv.staff_role);
        block = withId(r.block, id);
        m = r.meta;
      }
    }
    results.push(block);
    meta[id] = m;
    emit({ type: 'tool_end', id, status: m.status, summary: m.summary });
  }
  await appendMessage(conv.id, 'user', results, { tools: meta });
  await setPending(conv.id, null);

  const rc = await prepare(conv, user, emit);
  if (!rc) return;
  await guarded({ ...rc, conv: { ...conv, pending: null } });
}
