import type { ErrorCategory } from './sanitize'

export const STAGES = ['rewrite', 'embedding', 'rerank', 'generation'] as const
export type Stage = (typeof STAGES)[number]

// A metric that is absent was unavailable, never zero.
export interface StageUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface RetrievedChunk {
  chunkId: string
  slug: string
  rank: number
  hybridScore?: number
  sources?: string
}

export interface RagQueryRecord {
  schemaVersion: 1
  queryId: string
  timestamp: string
  status: 'success' | 'failure'
  model: string
  stageModels: Record<Stage, string>
  retrievalMethod: string
  queryText?: string
  responseText?: string
  chunks: RetrievedChunk[]
  candidateCount?: number
  timings: {
    rewriteMs?: number
    embeddingMs?: number
    searchMs?: number
    retrievalMs?: number
    generationMs?: number
    totalMs: number
  }
  usage: Partial<Record<Stage, StageUsage>>
  estimatedCostUsd?: number
  costBreakdownUsd?: Partial<Record<Stage, number>>
  pricingVersion?: string
  errorCategory?: ErrorCategory
}
