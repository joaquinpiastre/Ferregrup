import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Save, Sparkles } from 'lucide-react';
import { fetchAiOverview, saveAiSettings, saveAiUserSettings, testAiConnection } from '../api';
import type { AiAccess, AiEffort, AiLimitMode, AiOverview, AiSettings, AiUserRow } from '../types';

interface Props {
  token: string;
}

const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => usd.format(n);
const fmtTypical = (n: number) => (n < 0.01 ? 'menos de US$ 0,01' : `≈ ${fmtUsd(n)}`);
const shortName = (name: string) => name.replace(/^Claude /, '');
const fmtPrice = (n: number) => (n < 1 ? n.toLocaleString('es-AR', { maximumFractionDigits: 3 }) : n.toLocaleString('es-AR'));

const ACCESS_LABEL: Record<AiAccess, string> = { off: 'Sin acceso', read: 'Solo consultas', write: 'Consultas y cambios' };
const EFFORT_OPTIONS: { id: AiEffort; label: string }[] = [
  { id: 'auto', label: 'Automático (recomendado para cada modelo)' },
  { id: 'low', label: 'Bajo — más rápido y barato, piensa menos' },
  { id: 'medium', label: 'Medio — equilibrado' },
  { id: 'high', label: 'Alto — más preciso, más lento y caro' },
];

/** Texto de un input de dólares → número (vacío = sin límite). */
function parseUsd(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface RowDraft {
  access: AiAccess | 'default';
  model: string | null;
  limitMode: AiLimitMode;
  limitText: string;
}

const draftOf = (u: AiUserRow): RowDraft => ({
  access: u.access,
  model: u.model,
  limitMode: u.limitMode,
  limitText: u.customLimitUsd !== null ? String(u.customLimitUsd) : '',
});

function UsageBar({ spent, limit }: { spent: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (spent / limit) * 100) : 0;
  const color = pct >= 100 ? '#f87171' : pct >= 80 ? '#fb923c' : '#4ade80';
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 13, color: '#fff' }}>
        {fmtUsd(spent)} <span style={{ color: '#666', fontSize: 11 }}>{limit !== null ? `de ${fmtUsd(limit)}` : 'sin límite'}</span>
      </div>
      {limit !== null && (
        <div style={{ height: 4, background: '#2d2d2d', borderRadius: 2, marginTop: 4 }}>
          <div style={{ width: `${pct}%`, height: 4, background: color, borderRadius: 2 }} />
        </div>
      )}
    </div>
  );
}

export default function IAPanel({ token }: Props) {
  const [data, setData] = useState<AiOverview | null>(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [limitText, setLimitText] = useState({ user: '', global: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [test, setTest] = useState<{ running: boolean; ok?: boolean; error?: string; available?: Record<string, boolean> }>({ running: false });

  const load = useCallback(() => {
    fetchAiOverview(token)
      .then((d) => {
        setData(d);
        setSettings(d.settings);
        setLimitText({
          user: d.settings.defaultUserLimitUsd === null ? '' : String(d.settings.defaultUserLimitUsd),
          global: d.settings.globalMonthlyLimitUsd === null ? '' : String(d.settings.globalMonthlyLimitUsd),
        });
        setDrafts(Object.fromEntries(d.users.map((u) => [u.id, draftOf(u)])));
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración de IA.'));
  }, [token]);

  useEffect(load, [load]);

  async function save(patch: Partial<AiSettings>) {
    setSavingSettings(true);
    setSettingsMsg('');
    try {
      await saveAiSettings(token, patch);
      setSettingsMsg('Guardado.');
      load();
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveGeneral() {
    if (!settings) return;
    const user = parseUsd(limitText.user);
    const global = parseUsd(limitText.global);
    if (user === undefined || global === undefined) {
      setSettingsMsg('Los límites tienen que ser montos en dólares (o vacío para "sin límite").');
      return;
    }
    await save({ effort: settings.effort, requireConfirmation: settings.requireConfirmation, defaultUserLimitUsd: user, globalMonthlyLimitUsd: global });
  }

  async function runTest() {
    setTest({ running: true });
    try {
      const r = await testAiConnection(token);
      setTest({ running: false, ok: r.ok, error: r.error, available: r.models ? Object.fromEntries(r.models.map((m) => [m.id, m.available])) : undefined });
    } catch (e) {
      setTest({ running: false, ok: false, error: e instanceof Error ? e.message : 'Error' });
    }
  }

  async function saveRow(u: AiUserRow) {
    const d = drafts[u.id];
    let monthlyLimitUsd: number | null | undefined;
    if (d.limitMode === 'custom') {
      monthlyLimitUsd = parseUsd(d.limitText);
      if (monthlyLimitUsd === undefined || monthlyLimitUsd === null) {
        alert('Ingresá el límite mensual en dólares.');
        return;
      }
    }
    setSavingRow(u.id);
    try {
      await saveAiUserSettings(token, u.id, { access: d.access, model: d.model, limitMode: d.limitMode, monthlyLimitUsd });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSavingRow(null);
    }
  }

  if (error) return <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>;
  if (!data || !settings) return <p style={{ color: '#666', fontSize: 14 }}>Cargando…</p>;

  const defaultModel = data.models.find((m) => m.id === data.settings.defaultModel);
  const modelName = (id: string) => data.models.find((m) => m.id === id)?.name ?? id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ─── Estado ─── */}
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Sparkles size={22} color="#FE4806" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
            Asistente {data.settings.enabled ? 'activado' : 'desactivado'} · {defaultModel?.name ?? data.settings.defaultModel}
          </div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
            Gasto del equipo este mes: <strong style={{ color: '#fff' }}>{fmtUsd(data.totals.spentUsd)}</strong>
            {data.settings.globalMonthlyLimitUsd !== null ? ` de ${fmtUsd(data.settings.globalMonthlyLimitUsd)}` : ''} · mes anterior {fmtUsd(data.totals.spentPrevUsd)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, color: data.apiConfigured ? '#4ade80' : '#f87171' }}>
            <KeyRound size={13} /> {data.apiConfigured ? 'Clave de API de Anthropic configurada en el servidor' : 'Falta la clave de API de Anthropic'}
            {test.ok === true && <span style={{ color: '#4ade80' }}>· conexión OK</span>}
            {test.ok === false && <span style={{ color: '#f87171' }}>· {test.error}</span>}
          </div>
        </div>
        <button className="btn-secondary" onClick={() => void runTest()} disabled={test.running}>
          {test.running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Probar conexión
        </button>
        <button className={data.settings.enabled ? 'btn-danger' : 'btn-primary'} onClick={() => void save({ enabled: !data.settings.enabled })} disabled={savingSettings}>
          {data.settings.enabled ? 'Desactivar IA' : 'Activar IA'}
        </button>
      </div>

      {!data.apiConfigured && (
        <div className="card" style={{ borderColor: '#f8717155', fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
          <strong style={{ color: '#fff' }}>Cómo activar la IA:</strong> creá una clave en <span style={{ color: '#FE4806' }}>console.anthropic.com</span> (API Keys) y cargala en Railway, en el servicio
          <code style={{ margin: '0 4px' }}>ferregrup-api</code> → Variables, con el nombre <code style={{ margin: '0 4px' }}>ANTHROPIC_API_KEY</code>. El servicio se reinicia solo y el asistente queda listo. La clave nunca se muestra ni viaja al navegador.
        </div>
      )}

      {/* ─── Modelos ─── */}
      <div>
        <h2 style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>Modelo de IA</h2>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>
          El elegido es el que usa todo el equipo, salvo que a un usuario le asignes otro abajo. Los precios son de Anthropic, en dólares por millón de tokens (≈ 750.000 palabras); el costo por pregunta es aproximado.
        </p>
        <div className="ai-model-grid">
          {data.models.map((m) => {
            const selected = m.id === data.settings.defaultModel;
            const available = test.available?.[m.id];
            return (
              <div key={m.id} className="card" style={{ padding: 16, borderColor: selected ? '#FE4806' : '#2d2d2d', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                  {m.recommended && <span className="badge badge-yellow" style={{ fontSize: 10 }}>Recomendado</span>}
                  {available === true && <CheckCircle2 size={14} color="#4ade80" aria-label="Disponible" />}
                  {available === false && <span className="badge badge-red" style={{ fontSize: 10 }}>No disponible en tu cuenta</span>}
                </div>
                <div style={{ color: '#FE4806', fontSize: 13, fontWeight: 600 }}>{m.bestFor}</div>
                <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.5 }}>{m.description}</div>
                <div style={{ fontSize: 12, color: '#ccc' }}>
                  <div style={{ color: '#777', marginBottom: 2 }}>Sirve más para:</div>
                  <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>{m.goodAt.map((g) => <li key={g}>{g}</li>)}</ul>
                </div>
                <div style={{ fontSize: 12, color: '#888' }}><span style={{ color: '#777' }}>No conviene para:</span> {m.notIdealFor}</div>
                {m.note && <div style={{ fontSize: 11, color: '#fbbf24' }}>{m.note}</div>}
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#888', borderTop: '1px solid #2d2d2d', paddingTop: 8, flexWrap: 'wrap' }}>
                  <span>Velocidad: <strong style={{ color: '#ccc' }}>{m.speed}</strong></span>
                  <span>US$ {fmtPrice(m.inputPerMTok)} / {fmtPrice(m.outputPerMTok)} por M tokens</span>
                  <span>{fmtTypical(m.typicalQuestionUsd)} por pregunta</span>
                </div>
                <button className={selected ? 'btn-primary' : 'btn-secondary'} style={{ justifyContent: 'center' }} disabled={selected || savingSettings} onClick={() => void save({ defaultModel: m.id })}>
                  {selected ? 'En uso' : 'Usar este modelo'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Ajustes generales ─── */}
      <div className="card">
        <h2 style={{ fontSize: 16, color: '#fff', marginBottom: 12 }}>Ajustes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <label>Cuánto razona la IA</label>
            <select className="input-field" value={settings.effort} onChange={(e) => setSettings({ ...settings, effort: e.target.value as AiEffort })}>
              {EFFORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label>Límite mensual por usuario (US$, vacío = sin límite)</label>
            <input className="input-field" inputMode="decimal" value={limitText.user} onChange={(e) => setLimitText({ ...limitText, user: e.target.value })} placeholder="sin límite" />
          </div>
          <div>
            <label>Límite mensual de todo el equipo (US$, vacío = sin límite)</label>
            <input className="input-field" inputMode="decimal" value={limitText.global} onChange={(e) => setLimitText({ ...limitText, global: e.target.value })} placeholder="sin límite" />
          </div>
          <div>
            <label>Cambios en los datos</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ddd', fontSize: 13, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.requireConfirmation} onChange={(e) => setSettings({ ...settings, requireConfirmation: e.target.checked })} />
              Pedir confirmación antes de aplicar cada cambio (recomendado)
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button className="btn-primary" onClick={() => void saveGeneral()} disabled={savingSettings}><Save size={14} /> Guardar ajustes</button>
          {settingsMsg && <span style={{ fontSize: 12, color: settingsMsg === 'Guardado.' ? '#4ade80' : '#f87171' }}>{settingsMsg}</span>}
        </div>
        <p style={{ color: '#666', fontSize: 11, margin: '12px 0 0', lineHeight: 1.5 }}>
          La IA solo puede cambiar datos del negocio (productos, stock, precios, clientes, listas, proveedores, camioneta, ventas y cobros) a través de las mismas reglas que la pantalla, con los permisos del usuario que la usa. No puede tocar el sistema, los usuarios, los PIN ni esta configuración, ni borrar ventas o cobros. Todo lo que hace queda en Actividad marcado con [IA].
        </p>
      </div>

      {/* ─── Usuarios ─── */}
      <div>
        <h2 style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>Usuarios</h2>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>
          Cada usuario tiene sus propias conversaciones (nadie más las ve). Por defecto los administradores pueden consultar y hacer cambios, y los repartidores y vendedores solo consultar.
        </p>
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Acceso</th>
                <th>Modelo</th>
                <th>Límite mensual</th>
                <th>Gastado este mes</th>
                <th style={{ textAlign: 'right' }}>Mes anterior</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const d = drafts[u.id] ?? draftOf(u);
                const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(u));
                const setD = (patch: Partial<RowDraft>) => setDrafts((all) => ({ ...all, [u.id]: { ...d, ...patch } }));
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                    <td>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{u.name}</div>
                      <div style={{ color: '#777', fontSize: 11 }}>
                        {u.role === 'admin' ? 'Administrador' : u.role === 'vendedor' ? 'Vendedor' : 'Repartidor'}{!u.active ? ' · inactivo' : ''}
                        {u.callsThisMonth > 0 ? ` · ${u.callsThisMonth} llamadas a la IA este mes` : ''}
                      </div>
                    </td>
                    <td>
                      <select className="input-field" style={{ padding: '5px 8px', fontSize: 12, minWidth: 190 }} value={d.access} onChange={(e) => setD({ access: e.target.value as RowDraft['access'] })}>
                        <option value="default">Según rol: {ACCESS_LABEL[u.defaultAccess].toLowerCase()}</option>
                        <option value="off">Sin acceso</option>
                        <option value="read">Solo consultas</option>
                        <option value="write">Consultas y cambios</option>
                      </select>
                    </td>
                    <td>
                      <select className="input-field" style={{ padding: '5px 8px', fontSize: 12, minWidth: 150 }} value={d.model ?? ''} onChange={(e) => setD({ model: e.target.value || null })}>
                        <option value="">General: {shortName(modelName(data.settings.defaultModel))}</option>
                        {data.models.map((m) => <option key={m.id} value={m.id}>{shortName(m.name)}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select className="input-field" style={{ padding: '5px 8px', fontSize: 12, minWidth: 140 }} value={d.limitMode} onChange={(e) => setD({ limitMode: e.target.value as AiLimitMode })}>
                          <option value="default">General: {data.settings.defaultUserLimitUsd === null ? 'sin límite' : fmtUsd(data.settings.defaultUserLimitUsd)}</option>
                          <option value="none">Sin límite</option>
                          <option value="custom">Personalizado</option>
                        </select>
                        {d.limitMode === 'custom' && (
                          <input className="input-field" style={{ padding: '5px 8px', fontSize: 12, width: 80 }} inputMode="decimal" placeholder="US$" value={d.limitText} onChange={(e) => setD({ limitText: e.target.value })} />
                        )}
                      </div>
                    </td>
                    <td><UsageBar spent={u.spentUsd} limit={u.limitUsd} /></td>
                    <td style={{ textAlign: 'right', color: '#888' }}>{fmtUsd(u.spentPrevUsd)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className={dirty ? 'btn-primary' : 'btn-secondary'} style={{ padding: '4px 10px', fontSize: 12 }} disabled={!dirty || savingRow === u.id} onClick={() => void saveRow(u)}>
                        {savingRow === u.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Consumo por modelo ─── */}
      {data.byModel.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, color: '#fff', marginBottom: 12 }}>Consumo por modelo este mes</h2>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th style={{ textAlign: 'right' }}>Llamadas</th>
                  <th style={{ textAlign: 'right' }}>Tokens de entrada</th>
                  <th style={{ textAlign: 'right' }}>Tokens de salida</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.map((r) => (
                  <tr key={r.model}>
                    <td style={{ color: '#fff' }}>{r.name}</td>
                    <td style={{ textAlign: 'right' }}>{r.calls.toLocaleString('es-AR')}</td>
                    <td style={{ textAlign: 'right' }}>{r.inputTokens.toLocaleString('es-AR')}</td>
                    <td style={{ textAlign: 'right' }}>{r.outputTokens.toLocaleString('es-AR')}</td>
                    <td style={{ textAlign: 'right', color: '#fff' }}>{fmtUsd(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
