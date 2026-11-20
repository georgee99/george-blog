import { randomUUID } from 'crypto'
import { estimateCostUsd } from './pricing'
import { categorizeError, sanitizeResponseText } from './sanitize'
import type { ErrorCategory } from './sanitize'
import type { RagQueryRecord, RetrievedChunk, Stage, StageUsage } from './types'

type DurationKey = 'rewriteMs' | 'embeddingMs' | 'searchMs' | 'generationMs'

interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

// Collects metrics for one /api/ask execution. All methods are side-effect free for the pipeline.
export class RagTrace {
  readonly queryId = randomUUID()
  readonly timestamp = new Date().toISOString()
  private readonly startedAt = performance.now()
  private readonly durations: Partial<Record<DurationKey, number>> = {}
  private readonly usage: Partial<Record<Stage, StageUsage>> = {}
  private chunks: RetrievedChunk[] = []
  private candidateCount: number | undefined
  private reranked = false
  private failed = false
  private errorCategory: ErrorCategory | undefined
  private responseText = ''

  constructor(
    private readonly queryText: string,
    private readonly models: Record<Stage, string>,
  ) {}

  async time<T>(name: DurationKey, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now()
    try {
      return await fn()
    } finally {
      this.durations[name] = Math.round(performance.now() - t0)
    }
  }

  recordUsage(stage: Stage, usage: OpenAIUsage | null | undefined): void {
    if (!usage) return
    const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined
    const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined
    if (inputTokens === undefined && outputTokens === undefined) return
    this.usage[stage] = {
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
    }
  }

  setCandidateCount(count: number): void {
    this.candidateCount = count
  }

  setChunks(chunks: RetrievedChunk[]): void {
    this.chunks = chunks
  }

  markReranked(): void {
    this.reranked = true
  }

  appendResponse(content: string): void {
    this.responseText += content
  }

  fail(error: unknown): void {
    this.failed = true
    this.errorCategory = categorizeError(error)
  }

  toRecord(): RagQueryRecord {
    const totalMs = Math.round(performance.now() - this.startedAt)
    const { rewriteMs, embeddingMs, searchMs, generationMs } = this.durations
    const retrievalParts = [rewriteMs, embeddingMs, searchMs]
    const retrievalMs = retrievalParts.some((v) => v !== undefined)
      ? retrievalParts.reduce<number>((a, b) => a + (b ?? 0), 0)
      : undefined

    const costBreakdownUsd: Partial<Record<Stage, number>> = {}
    let pricingVersion: string | undefined
    for (const stage of Object.keys(this.usage) as Stage[]) {
      const cost = estimateCostUsd(this.models[stage], this.usage[stage])
      if (cost) {
        costBreakdownUsd[stage] = cost.costUsd
        pricingVersion = cost.pricingVersion
      }
    }
    const costs = Object.values(costBreakdownUsd)

    return {
      schemaVersion: 1,
      queryId: this.queryId,
      timestamp: this.timestamp,
      status: this.failed ? 'failure' : 'success',
      model: this.models.generation,
      stageModels: this.models,
      retrievalMethod: this.reranked ? 'hybrid+rerank' : 'hybrid',
      ...(this.queryText ? { queryText: this.queryText } : {}),
      ...(this.responseText ? { responseText: sanitizeResponseText(this.responseText) } : {}),
      chunks: this.chunks,
      ...(this.candidateCount !== undefined ? { candidateCount: this.candidateCount } : {}),
      timings: {
        totalMs,
        ...(rewriteMs !== undefined ? { rewriteMs } : {}),
        ...(embeddingMs !== undefined ? { embeddingMs } : {}),
        ...(searchMs !== undefined ? { searchMs } : {}),
        ...(retrievalMs !== undefined ? { retrievalMs } : {}),
        ...(generationMs !== undefined ? { generationMs } : {}),
      },
      usage: this.usage,
      ...(costs.length > 0
        ? { estimatedCostUsd: costs.reduce((a, b) => a + b, 0), costBreakdownUsd, pricingVersion }
        : {}),
      ...(this.errorCategory ? { errorCategory: this.errorCategory } : {}),
    }
  }
}
