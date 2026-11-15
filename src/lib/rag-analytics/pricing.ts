import type { StageUsage } from './types'

export interface ModelPrice {
  inputPerMTok: number
  outputPerMTok: number
}

// USD per 1M tokens. These are estimates: verify against current provider pricing, or override
// them without a code change via RAG_MODEL_PRICING_JSON, e.g. {"gpt-4o-mini":{"inputPerMTok":0.15,"outputPerMTok":0.6}}
const DEFAULT_PRICING: Record<string, ModelPrice> = {
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'text-embedding-3-small': { inputPerMTok: 0.02, outputPerMTok: 0 },
}

function loadPricing(): { table: Record<string, ModelPrice>; version: string } {
  const override = process.env.RAG_MODEL_PRICING_JSON
  if (override) {
    try {
      const parsed = JSON.parse(override) as Record<string, ModelPrice>
      return { table: { ...DEFAULT_PRICING, ...parsed }, version: 'env-override' }
    } catch {
      console.error('[rag-analytics] RAG_MODEL_PRICING_JSON is invalid; using defaults')
    }
  }
  return { table: DEFAULT_PRICING, version: 'builtin-v1' }
}

// Returns undefined (unavailable) unless the model is priced and the needed token counts were captured.
export function estimateCostUsd(
  model: string,
  usage: StageUsage | undefined,
): { costUsd: number; pricingVersion: string } | undefined {
  const { table, version } = loadPricing()
  const price = table[model]
  if (!price || !usage || usage.inputTokens === undefined) return undefined
  if (usage.outputTokens === undefined && price.outputPerMTok > 0) return undefined

  const costUsd =
    (usage.inputTokens * price.inputPerMTok + (usage.outputTokens ?? 0) * price.outputPerMTok) /
    1_000_000
  return { costUsd, pricingVersion: version }
}
