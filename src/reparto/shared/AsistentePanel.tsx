import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Plus, Send, Sparkles, Trash2, X, XCircle } from 'lucide-react';
import {
  confirmAiActions,
  createAiConversation,
  deleteAiConversation,
  fetchAiConversation,
  fetchAiConversations,
  fetchAiMe,
  sendAiMessage,
} from '../api';
import type { AiChatItem, AiConfirmAction, AiConversation, AiConversationSummary, AiEvent, AiMe, Session } from '../types';
import Markdown from './Markdown';

interface Props {
  session: Session;
  /** Lista de conversaciones como desplegable (pantallas angostas / panel del repartidor). */
  compact?: boolean;
}

const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => usd.format(n < 0.005 && n > 0 ? 0.01 : n);

const SUGGESTIONS = {
  admin: [
    '¿Qué productos están sin stock?',
    '¿Cómo vienen las ventas y los cobros este mes?',
    '¿Qué clientes tienen cuotas atrasadas?',
    'Aumentá 10% el precio de los productos que dicen "tornillo"',
  ],
  vendedor: [
    '¿Hay stock de taladros y a qué precio?',
    '¿Cuál es mi objetivo de cobranza de esta semana?',
    '¿Qué clientes míos tienen cuotas atrasadas?',
    '¿Cuánto vendí este mes?',
  ],
  repartidor: [
    '¿Cuál es mi objetivo de cobranza de esta semana?',
    '¿Qué clientes míos tienen cuotas atrasadas?',
    '¿Cuánto cobré esta semana?',
    '¿Hay stock de taladros y a qué precio?',
  ],
};

const LONG_CONTEXT = 150_000;

function ToolChip({ item }: { item: Extract<AiChatItem, { kind: 'tool' }> }) {
  const icon =
    item.status === 'running' ? <Loader2 size={13} className="animate-spin" color="#FE4806" />
    : item.status === 'ok' ? <CheckCircle2 size={13} color="#4ade80" />
    : item.status === 'error' ? <XCircle size={13} color="#f87171" />
    : item.status === 'pendiente' ? <AlertTriangle size={13} color="#fb923c" />
    : <X size={13} color="#777" />;
  const note = item.status === 'pendiente' ? 'Esperando tu confirmación' : item.status === 'cancelado' && !item.summary ? 'No se aplicó' : item.summary;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#999', padding: '3px 0' }}>
      {icon}
      <span style={{ color: '#bbb' }}>{item.label}</span>
      {note && <span style={{ color: item.status === 'error' ? '#f87171' : '#777' }}>· {note}</span>}
    </div>
  );
}

export default function AsistentePanel({ session, compact }: Props) {
  const token = session.token;
  const [me, setMe] = useState<AiMe | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conv, setConv] = useState<AiConversation | null>(null);
  const [live, setLive] = useState<AiChatItem[]>([]);
  const [pending, setPending] = useState<AiConfirmAction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [loadError, setLoadError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const iterationStart = useRef(0);
  const liveCount = useRef(0);
  // La conversación recién creada al mandar el primer mensaje no se recarga (borraría lo que llega en vivo).
  const justCreated = useRef<string | null>(null);
  const convRef = useRef<AiConversation | null>(null);
  convRef.current = conv;

  const refreshList = useCallback(() => fetchAiConversations(token).then(setConversations).catch(() => {}), [token]);

  useEffect(() => {
    fetchAiMe(token).then(setMe).catch((e) => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el asistente.'));
    fetchAiConversations(token)
      .then((list) => {
        setConversations(list);
        if (list[0]) setActiveId(list[0].id);
      })
      .catch(() => {});
  }, [token]);

  const loadConversation = useCallback(
    async (id: string) => {
      const c = await fetchAiConversation(token, id);
      setConv(c);
      setPending(c.pending);
      return c;
    },
    [token]
  );

  useEffect(() => {
    if (!activeId) {
      setConv(null);
      setPending(null);
      return;
    }
    if (justCreated.current === activeId) {
      justCreated.current = null;
      return;
    }
    setLive([]);
    loadConversation(activeId).catch((e) => setLoadError(e instanceof Error ? e.message : 'No se pudo abrir la conversación.'));
  }, [activeId, loadConversation]);

  const items = [...(conv?.items ?? []), ...live];
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, live, pending]);

  const updateTool = (id: string, patch: Partial<Extract<AiChatItem, { kind: 'tool' }>>) => {
    const apply = (list: AiChatItem[]) => list.map((it) => (it.kind === 'tool' && it.id === id ? { ...it, ...patch } : it));
    setConv((c) => (c ? { ...c, items: apply(c.items) } : c));
    setLive(apply);
  };

  const handleEvent = (e: AiEvent) => {
    switch (e.type) {
      case 'iteration':
        iterationStart.current = liveCount.current;
        break;
      case 'retry':
        setLive((l) => {
          const next = l.slice(0, iterationStart.current);
          liveCount.current = next.length;
          return next;
        });
        break;
      case 'text':
        setLive((l) => {
          const last = l[l.length - 1];
          if (last?.kind === 'assistant') return [...l.slice(0, -1), { ...last, text: last.text + e.text }];
          liveCount.current = l.length + 1;
          return [...l, { kind: 'assistant', id: `live-a-${l.length}`, text: e.text }];
        });
        break;
      case 'tool_start': {
        const known = (convRef.current?.items ?? []).some((it) => it.kind === 'tool' && it.id === e.id);
        if (known) updateTool(e.id, { status: 'running' });
        else
          setLive((l) => {
            if (l.some((it) => it.kind === 'tool' && it.id === e.id)) return l;
            liveCount.current = l.length + 1;
            return [...l, { kind: 'tool', id: e.id, name: e.name, label: e.label, status: 'running' }];
          });
        break;
      }
      case 'tool_end':
        updateTool(e.id, { status: e.status, summary: e.summary });
        break;
      case 'confirm':
        setPending(e.actions);
        e.actions.forEach((a) => updateTool(a.id, { status: 'pendiente' }));
        break;
      case 'usage':
        setMe((m) => (m ? { ...m, spentUsd: e.spentUsd, limitUsd: e.limitUsd } : m));
        break;
      case 'error':
        setLive((l) => {
          liveCount.current = l.length + 1;
          return [...l, { kind: 'error', id: `live-e-${l.length}`, text: e.message }];
        });
        break;
      case 'done':
        break;
    }
  };

  async function finishRun(id: string) {
    try {
      await loadConversation(id);
      // Lo que vino en vivo ya está en el historial del servidor; solo quedan los avisos de error.
      setLive((l) => l.filter((it) => it.kind === 'error'));
    } catch {
      /* se mantiene lo que llegó en vivo */
    }
    refreshList();
    fetchAiMe(token).then(setMe).catch(() => {});
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setInput('');
    setPending(null);
    let id = activeId;
    try {
      if (!id) {
        id = await createAiConversation(token);
        justCreated.current = id;
        setConv({ id, title: 'Nueva conversación', items: [], pending: null, contextTokens: 0, running: false, roleChanged: false });
        setActiveId(id);
      }
      const userItem: AiChatItem = { kind: 'user', id: `live-u-${Date.now()}`, text };
      setLive([userItem]);
      liveCount.current = 1;
      iterationStart.current = 1;
      // Si había cambios esperando confirmación, el servidor los descarta.
      setConv((c) => (c ? { ...c, items: c.items.map((it) => (it.kind === 'tool' && it.status === 'pendiente' ? { ...it, status: 'cancelado' } : it)) } : c));
      await sendAiMessage(token, id, text, handleEvent);
    } catch (e) {
      setLive((l) => [...l, { kind: 'error', id: `live-e-${Date.now()}`, text: e instanceof Error ? e.message : 'No se pudo enviar el mensaje.' }]);
    } finally {
      if (id) await finishRun(id);
      setBusy(false);
    }
  }

  async function resolve(approve: boolean) {
    if (!activeId || busy) return;
    setBusy(true);
    setPending(null);
    setLive([]);
    liveCount.current = 0;
    iterationStart.current = 0;
    try {
      await confirmAiActions(token, activeId, approve, handleEvent);
    } catch (e) {
      setLive((l) => [...l, { kind: 'error', id: `live-e-${Date.now()}`, text: e instanceof Error ? e.message : 'No se pudo confirmar.' }]);
    } finally {
      await finishRun(activeId);
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta conversación? (El consumo ya registrado no se borra.)')) return;
    try {
      await deleteAiConversation(token, id);
      const rest = conversations.filter((c) => c.id !== id);
      setConversations(rest);
      if (activeId === id) setActiveId(rest[0]?.id ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo borrar.');
    }
  }

  function newConversation() {
    if (busy) return;
    setActiveId(null);
    setLive([]);
    setInput('');
  }

  const blockedReason = !me
    ? null
    : !me.globallyEnabled
      ? 'El asistente de IA está desactivado por el administrador.'
      : me.access === 'off'
        ? 'El administrador no te habilitó el asistente de IA.'
        : !me.apiConfigured
          ? session.staff.role === 'admin'
            ? 'Falta configurar la clave de la API de Anthropic en el servidor. Mirá Administración → Inteligencia artificial.'
            : 'El asistente de IA todavía no está configurado.'
          : me.limitUsd !== null && me.spentUsd >= me.limitUsd
            ? `Llegaste a tu límite mensual de IA (${fmtUsd(me.limitUsd)}). Pedile al administrador que lo amplíe.`
            : conv?.roleChanged
              ? 'Tu rol cambió desde que empezaste esta conversación: empezá una nueva.'
              : null;
  const canType = !!me && !blockedReason && !busy;
  const suggestions = SUGGESTIONS[session.staff.role];

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button className="btn-primary" style={{ justifyContent: 'center', marginBottom: 8 }} onClick={newConversation} disabled={busy}>
        <Plus size={14} /> Nueva conversación
      </button>
      {conversations.length === 0 && <div style={{ color: '#555', fontSize: 12, padding: 6 }}>Todavía no hay conversaciones.</div>}
      {conversations.map((c) => (
        <div
          key={c.id}
          onClick={() => !busy && setActiveId(c.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 8px',
            borderRadius: 7,
            cursor: busy ? 'default' : 'pointer',
            background: c.id === activeId ? '#262626' : 'transparent',
            color: c.id === activeId ? '#fff' : '#999',
            fontSize: 13,
          }}
        >
          <MessageSquare size={13} style={{ flexShrink: 0 }} color={c.hasPending ? '#fb923c' : '#555'} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
          <button
            aria-label="Borrar conversación"
            onClick={(ev) => {
              ev.stopPropagation();
              void remove(c.id);
            }}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 2, display: 'flex' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`ai-chat${compact ? ' compact' : ''}`}>
      <aside className="ai-chat-list">{list}</aside>
      <section className="ai-chat-main">
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #2d2d2d', flexWrap: 'wrap' }}>
          <div className="ai-only-compact" style={{ gap: 6, flex: '1 1 240px', minWidth: 0 }}>
              <select className="input-field" style={{ padding: '5px 8px', fontSize: 13 }} value={activeId ?? ''} onChange={(e) => !busy && setActiveId(e.target.value || null)} disabled={busy}>
                <option value="">Nueva conversación</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <button className="btn-secondary" style={{ padding: '4px 9px' }} onClick={newConversation} disabled={busy} aria-label="Nueva conversación"><Plus size={14} /></button>
              {activeId && <button className="btn-secondary" style={{ padding: '4px 9px' }} onClick={() => void remove(activeId)} disabled={busy} aria-label="Borrar conversación"><Trash2 size={13} /></button>}
          </div>
          <div className="ai-only-wide" style={{ flex: 1, minWidth: 0, color: '#fff', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv?.title ?? 'Nueva conversación'}
          </div>
          {me?.model && (
            <span className="badge badge-gray" style={{ fontSize: 11, gap: 5 }}>
              <Sparkles size={11} color="#FE4806" /> {me.model.name}
            </span>
          )}
          {me && (
            <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }} title="Gasto de IA de tu usuario este mes">
              {fmtUsd(me.spentUsd)}
              {me.limitUsd !== null ? ` de ${fmtUsd(me.limitUsd)}` : ''} este mes
            </span>
          )}
        </header>

        <div ref={scrollRef} className="ai-chat-messages">
          {loadError && <div style={{ color: '#f87171', fontSize: 13 }}>{loadError}</div>}
          {items.length === 0 && !loadError && (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 440, padding: '20px 8px' }}>
              <Sparkles size={28} color="#FE4806" style={{ margin: '0 auto 10px' }} />
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Asistente de El Maná</div>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
                Preguntale por productos, stock, clientes, ventas o cobros.
                {me?.access === 'write' ? ' También puede hacer cambios en los datos: siempre te muestra qué va a cambiar antes de aplicarlo.' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {suggestions.map((s) => (
                  <button key={s} className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: 13, textAlign: 'left' }} disabled={!canType} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.map((it) => {
            if (it.kind === 'user')
              return (
                <div key={it.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#2d1100', border: '1px solid #FE480633', color: '#fff', padding: '8px 12px', borderRadius: '12px 12px 2px 12px', fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {it.text}
                </div>
              );
            if (it.kind === 'assistant')
              return (
                <div key={it.id} style={{ alignSelf: 'flex-start', maxWidth: '100%', minWidth: 0 }}>
                  <Markdown text={it.text} />
                </div>
              );
            if (it.kind === 'tool') return <ToolChip key={it.id} item={it} />;
            return (
              <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#f87171', fontSize: 13, background: '#2d0d0d', border: '1px solid #f8717133', borderRadius: 8, padding: '8px 10px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {it.text}
              </div>
            );
          })}

          {busy && !pending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#777', fontSize: 12 }}>
              <Loader2 size={13} className="animate-spin" /> La IA está trabajando…
            </div>
          )}

          {pending && pending.length > 0 && (
            <div style={{ border: '1px solid #fb923c66', background: '#1f1408', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#fb923c', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                <AlertTriangle size={15} /> La IA quiere hacer {pending.length === 1 ? 'este cambio' : `estos ${pending.length} cambios`}
              </div>
              {pending.map((a) => (
                <div key={a.id} style={{ marginBottom: 10 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, listStyle: 'disc', color: '#ccc', fontSize: 13 }}>
                    {a.details.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                  {a.warning && <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 4 }}>⚠ {a.warning}</div>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <button className="btn-primary" onClick={() => void resolve(true)} disabled={busy}><CheckCircle2 size={14} /> Confirmar {pending.length === 1 ? 'cambio' : 'cambios'}</button>
                <button className="btn-secondary" onClick={() => void resolve(false)} disabled={busy}><X size={14} /> Cancelar</button>
              </div>
              <div style={{ color: '#777', fontSize: 11, marginTop: 8 }}>Si escribís otro mensaje en lugar de confirmar, estos cambios se descartan.</div>
            </div>
          )}

          {conv && conv.contextTokens > LONG_CONTEXT && (
            <div style={{ color: '#888', fontSize: 12, textAlign: 'center' }}>
              Esta conversación ya es larga: empezá una nueva para que la IA responda más rápido y gaste menos.
            </div>
          )}
        </div>

        <footer style={{ borderTop: '1px solid #2d2d2d', padding: 10 }}>
          {blockedReason && <div style={{ color: '#fb923c', fontSize: 12, marginBottom: 8 }}>{blockedReason}</div>}
          {me?.access === 'read' && !blockedReason && (
            <div style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>Tu acceso es de solo consultas: la IA puede responder pero no modificar datos.</div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              className="input-field"
              rows={1}
              value={input}
              placeholder={canType ? 'Escribí tu pregunta o pedido…' : ''}
              disabled={!canType}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              style={{ resize: 'none', minHeight: 40, maxHeight: 160, fieldSizing: 'content' } as CSSProperties}
            />
            <button className="btn-primary" style={{ height: 40 }} onClick={() => void send()} disabled={!canType || !input.trim()} aria-label="Enviar">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
