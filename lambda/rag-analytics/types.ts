export type QueryStatus = 'success' | 'failure';

export const ERROR_CATEGORIES = [
  'upstream_rate_limited',
  'upstream_auth',
  'upstream_error',
  'timeout',
  'internal_error',
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const STAGES = ['rewrite', 'embedding', 'rerank', 'generation'] as const;
export type Stage = (typeof STAGES)[number];

// A metric that is absent from a record was unavailable, never zero.
export interface StageUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface RetrievedChunk {
  chunkId: string;
  slug: string;
  rank: number;
  hybridScore?: number;
  sources?: string;
}

export interface Timings {
  rewriteMs?: number;
  embeddingMs?: number;
  searchMs?: number;
  retrievalMs?: number;
  generationMs?: number;
  totalMs: number;
}

export interface RagQueryRecord {
  schemaVersion: 1;
  queryId: string;
  timestamp: string;
  status: QueryStatus;
  model: string;
  stageModels?: Partial<Record<Stage, string>>;
  retrievalMethod: string;
  queryText?: string;
  responseText?: string;
  chunks: RetrievedChunk[];
  candidateCount?: number;
  timings: Timings;
  usage: Partial<Record<Stage, StageUsage>>;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  costBreakdownUsd?: Partial<Record<Stage, number>>;
  pricingVersion?: string;
  errorCategory?: ErrorCategory;
}

export interface StoredRecord extends RagQueryRecord {
  pk: string;
  sk: string;
  chunkCount: number;
  expiresAt: number;
}
