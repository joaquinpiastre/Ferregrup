import type { ConversationRow, MessageRow } from './agent.js';
import { toolLabel } from './tools.js';

export type ChatItem =
  | { kind: 'user'; id: string; text: string; at: number }
  | { kind: 'assistant'; id: string; text: string; at: number }
  | { kind: 'tool'; id: string; name: string; label: string; status: 'ok' | 'error' | 'cancelado' | 'pendiente'; summary?: string };

/** Arma la vista del chat a partir del historial tal cual se le manda a la API. */
export function toChatItems(rows: MessageRow[], conv: ConversationRow): ChatItem[] {
  const items: ChatItem[] = [];
  const toolItems = new Map<string, Extract<ChatItem, { kind: 'tool' }>>();
  const pendingIds = new Set(conv.pending?.actions.map((a) => a.id) ?? []);

  for (const row of rows) {
    const at = Number(row.created_at_ms);
    if (row.role === 'system') continue;
    const blocks = typeof row.content === 'string' ? [{ type: 'text' as const, text: row.content }] : (row.content ?? []);
    const hidden = new Set(row.meta?.hidden ?? []);

    if (row.role === 'user') {
      const texts: string[] = [];
      blocks.forEach((b, i) => {
        if (b.type === 'tool_result') {
          const item = toolItems.get(b.tool_use_id);
          const m = row.meta?.tools?.[b.tool_use_id];
          if (item) {
            item.status = m?.status ?? (b.is_error ? 'error' : 'ok');
            item.summary = m?.summary;
          }
        } else if (b.type === 'text' && !hidden.has(i)) {
          texts.push(b.text);
        }
      });
      if (texts.length) items.push({ kind: 'user', id: `u${row.id}`, text: texts.join('\n\n'), at });
      continue;
    }

    let buffer: string[] = [];
    const flush = (suffix: string) => {
      const text = buffer.join('\n\n').trim();
      if (text) items.push({ kind: 'assistant', id: `a${row.id}-${suffix}`, text, at });
      buffer = [];
    };
    blocks.forEach((b, i) => {
      if (b.type === 'text') buffer.push(b.text);
      else if (b.type === 'tool_use') {
        flush(String(i));
        // Sin resultado todavía: o espera confirmación, o ya se resolvió dentro del turno
        // pendiente (consultas), o el turno quedó cortado.
        const ready = conv.pending?.readyMeta[b.id];
        const item: Extract<ChatItem, { kind: 'tool' }> = {
          kind: 'tool',
          id: b.id,
          name: b.name,
          label: toolLabel(b.name),
          status: pendingIds.has(b.id) ? 'pendiente' : ready?.status ?? 'cancelado',
          summary: ready?.summary,
        };
        toolItems.set(b.id, item);
        items.push(item);
      }
    });
    flush('end');
  }
  return items;
}
