import type Anthropic from '@anthropic-ai/sdk';

export type Effort = 'low' | 'medium' | 'high';

export interface AiModelInfo {
  id: string;
  name: string;
  /** Una línea: para qué conviene usarlo. */
  bestFor: string;
  description: string;
  goodAt: string[];
  notIdealFor: string;
  speed: 'Muy rápido' | 'Rápido' | 'Moderado' | 'Más lento';
  /** USD por millón de tokens. */
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
  /** Haiku cobra distinto cuando el prompt supera los 100K tokens. */
  longPrompt?: { threshold: number; inputPerMTok: number; outputPerMTok: number };
  defaultEffort: Effort;
  /** Si la API puede reintentar solo en otro modelo cuando un filtro de seguridad rechaza el pedido. */
  serverFallback: boolean;
  recommended?: boolean;
  note?: string;
}

// Modelos que el admin puede elegir. Los precios son los de la API de Anthropic (USD por
// millón de tokens); el caché de prompts abarata mucho las conversaciones largas.
export const AI_MODELS: AiModelInfo[] = [
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    bestFor: 'El más confiable para modificar datos y hacer análisis.',
    description:
      'Recomendado para el administrador: entiende pedidos con varios pasos, revisa antes de cambiar y casi no se equivoca con números. Buen equilibrio entre calidad y costo.',
    goodAt: [
      'Cambios masivos de precios y stock',
      'Análisis de ventas, cobranzas y atrasados',
      'Pedidos con varios pasos ("buscá, compará y actualizá")',
    ],
    notIdealFor: 'Consultas muy simples y repetitivas (ahí Haiku sale mucho más barato).',
    speed: 'Moderado',
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
    defaultEffort: 'medium',
    serverFallback: true,
    recommended: true,
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    bestFor: 'Uso diario del mostrador: rápido y capaz, a mitad de precio que Opus.',
    description:
      'Muy bueno para el día a día: cargar productos, ajustar stock, armar listas de reparto y responder consultas sobre clientes y ventas.',
    goodAt: ['Cargas y correcciones de pocos productos', 'Consultas de clientes, saldos y ventas', 'Armar y modificar listas de reparto'],
    notIdealFor: 'Análisis largos o cambios grandes donde un error sale caro (mejor Opus).',
    speed: 'Rápido',
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.5,
    defaultEffort: 'medium',
    serverFallback: true,
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    bestFor: 'Consultas rápidas y baratas: ideal para repartidores.',
    description:
      'El más rápido y económico. Perfecto para preguntas puntuales ("¿cuánto debe tal cliente?", "¿hay stock de tal producto?").',
    goodAt: ['Stock y precio de un producto', 'Saldo y cuotas de un cliente', 'Respuestas rápidas desde el celular'],
    notIdealFor: 'Cambios masivos o pedidos ambiguos: puede pasar por alto detalles.',
    speed: 'Muy rápido',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125,
    longPrompt: { threshold: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
    defaultEffort: 'medium',
    serverFallback: false,
  },
  {
    id: 'claude-fable-5-2',
    name: 'Claude Fable 5.2',
    bestFor: 'El más inteligente, para análisis profundos y planificación.',
    description:
      'El modelo más capaz de Anthropic. Conviene solo para preguntas difíciles (proyecciones, revisar toda la cartera de clientes, planificar compras). Es el más lento y el más caro.',
    goodAt: ['Análisis profundos de todo el negocio', 'Planificación y proyecciones', 'Problemas difíciles con muchos datos'],
    notIdealFor: 'El uso diario: cuesta el doble que Opus y tarda más.',
    speed: 'Más lento',
    inputPerMTok: 8,
    outputPerMTok: 40,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 10,
    defaultEffort: 'high',
    serverFallback: true,
    note: 'Requiere que la cuenta de Anthropic tenga habilitada la retención de datos de 30 días.',
  },
];

// Modelos a los que la API puede derivar un pedido si un filtro de seguridad lo rechaza
// (no se pueden elegir; solo se usan para calcular bien el costo de esos pedidos).
const FALLBACK_PRICING: Record<string, Pick<AiModelInfo, 'inputPerMTok' | 'outputPerMTok' | 'cacheReadPerMTok' | 'cacheWritePerMTok'>> = {
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 },
  'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2.5 },
};

export const DEFAULT_MODEL_ID = 'claude-opus-5-5';

export function findModel(id: string | null | undefined): AiModelInfo | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

type Pricing = Pick<AiModelInfo, 'inputPerMTok' | 'outputPerMTok' | 'cacheReadPerMTok' | 'cacheWritePerMTok' | 'longPrompt'>;

function pricingFor(modelId: string): Pricing {
  const known = findModel(modelId);
  if (known) return known;
  // La API puede devolver el id con algún sufijo; se busca por prefijo antes de caer en Opus.
  const prefixed = AI_MODELS.find((m) => modelId.startsWith(m.id));
  if (prefixed) return prefixed;
  const fallbackKey = Object.keys(FALLBACK_PRICING).find((k) => modelId.startsWith(k));
  if (fallbackKey) return FALLBACK_PRICING[fallbackKey];
  // Desconocido: se cobra como el más caro de los elegibles para no subestimar el gasto.
  return findModel('claude-fable-5-2')!;
}

export interface UsageLine {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

function costOf(model: string, input: number, output: number, cacheRead: number, cacheWrite: number): number {
  const p = pricingFor(model);
  let inPrice = p.inputPerMTok;
  let outPrice = p.outputPerMTok;
  const long = p.longPrompt;
  if (long && input + cacheRead + cacheWrite > long.threshold) {
    inPrice = long.inputPerMTok;
    outPrice = long.outputPerMTok;
  }
  return (input * inPrice + output * outPrice + cacheRead * p.cacheReadPerMTok + cacheWrite * p.cacheWritePerMTok) / 1_000_000;
}

/**
 * Costo de una respuesta. Si hubo un reintento automático en otro modelo, `usage.iterations`
 * trae una entrada por intento (cada una con su modelo) y es la fuente de verdad del gasto.
 */
export function usageLines(message: Anthropic.Beta.BetaMessage, requestedModel: string): UsageLine[] {
  const iterations = message.usage.iterations ?? [];
  const sampling = iterations.filter(
    (it): it is Anthropic.Beta.BetaMessageIterationUsage | Anthropic.Beta.BetaFallbackMessageIterationUsage =>
      it.type === 'message' || it.type === 'fallback_message'
  );
  if (sampling.length > 0) {
    return sampling.map((it) => {
      const model = it.model ?? requestedModel;
      return {
        model,
        inputTokens: it.input_tokens,
        outputTokens: it.output_tokens,
        cacheReadTokens: it.cache_read_input_tokens,
        cacheWriteTokens: it.cache_creation_input_tokens,
        costUsd: costOf(model, it.input_tokens, it.output_tokens, it.cache_read_input_tokens, it.cache_creation_input_tokens),
      };
    });
  }
  const u = message.usage;
  const input = u.input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const model = message.model || requestedModel;
  return [
    {
      model,
      inputTokens: input,
      outputTokens: u.output_tokens,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      costUsd: costOf(model, input, u.output_tokens, cacheRead, cacheWrite),
    },
  ];
}

/**
 * Costo aproximado de una pregunta típica (para mostrarle al admin una referencia):
 * 3 llamadas con ~12K tokens de contexto ya en caché, ~2K nuevos y ~1.5K de salida
 * (respuesta + razonamiento) cada una.
 */
export function typicalQuestionCostUsd(model: AiModelInfo): number {
  return 3 * costOf(model.id, 2_000, 1_500, 12_000, 0);
}
