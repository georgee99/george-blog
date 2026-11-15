import {
  ERROR_CATEGORIES,
  STAGES,
  type RagQueryRecord,
  type RetrievedChunk,
  type Stage,
  type StageUsage,
  type Timings,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

function num(v: unknown, max: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;
}

function int(v: unknown, max: number): number | undefined {
  const n = num(v, max);
  return n === undefined ? undefined : Math.round(n);
}

function parseTimings(v: unknown): Timings | null {
  if (!isObject(v)) return null;
  const totalMs = int(v.totalMs, 3_600_000);
  if (totalMs === undefined) return null;
  const opt = (k: string) => int(v[k], 3_600_000);
  return {
    totalMs,
    ...(opt('rewriteMs') !== undefined ? { rewriteMs: opt('rewriteMs') } : {}),
    ...(opt('embeddingMs') !== undefined ? { embeddingMs: opt('embeddingMs') } : {}),
    ...(opt('searchMs') !== undefined ? { searchMs: opt('searchMs') } : {}),
    ...(opt('retrievalMs') !== undefined ? { retrievalMs: opt('retrievalMs') } : {}),
    ...(opt('generationMs') !== undefined ? { generationMs: opt('generationMs') } : {}),
  };
}

function parseChunks(v: unknown): RetrievedChunk[] | null {
  if (!Array.isArray(v) || v.length > 20) return null;
  const out: RetrievedChunk[] = [];
  for (const c of v) {
    if (!isObject(c)) return null;
    const chunkId = str(c.chunkId, 200);
    const slug = str(c.slug, 200);
    const rank = int(c.rank, 1000);
    if (!chunkId || !slug || rank === undefined) return null;
    const hybridScore = num(c.hybridScore, 1000);
    const sources = str(c.sources, 30);
    out.push({
      chunkId,
      slug,
      rank,
      ...(hybridScore !== undefined ? { hybridScore } : {}),
      ...(sources ? { sources } : {}),
    });
  }
  return out;
}

function parseUsage(v: unknown): Partial<Record<Stage, StageUsage>> {
  const out: Partial<Record<Stage, StageUsage>> = {};
  if (!isObject(v)) return out;
  for (const stage of STAGES) {
    const raw = v[stage];
    if (!isObject(raw)) continue;
    const inputTokens = int(raw.inputTokens, 10_000_000);
    const outputTokens = int(raw.outputTokens, 10_000_000);
    if (inputTokens === undefined && outputTokens === undefined) continue;
    out[stage] = {
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
    };
  }
  return out;
}

// Totals are the sum of captured stages only; they stay undefined when nothing was captured.
function sumTokens(
  usage: Partial<Record<Stage, StageUsage>>,
  key: keyof StageUsage,
): number | undefined {
  const values = Object.values(usage)
    .map((u) => u?.[key])
    .filter((n): n is number => typeof n === 'number');
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
}

// Whitelists known fields and clamps values; returns null for anything malformed.
export function parseRecord(input: unknown, now = Date.now()): RagQueryRecord | null {
  if (!isObject(input)) return null;

  const queryId = typeof input.queryId === 'string' && UUID_RE.test(input.queryId) ? input.queryId : undefined;
  const parsedTime = typeof input.timestamp === 'string' ? Date.parse(input.timestamp) : NaN;
  const status = input.status === 'success' || input.status === 'failure' ? input.status : undefined;
  const model = str(input.model, 100);
  const retrievalMethod = str(input.retrievalMethod, 50);
  const timings = parseTimings(input.timings);
  const chunks = parseChunks(input.chunks);

  if (!queryId || !status || !model || !retrievalMethod || !timings || !chunks) return null;
  if (!Number.isFinite(parsedTime) || Math.abs(parsedTime - now) > MAX_CLOCK_SKEW_MS) return null;

  const usage = parseUsage(input.usage);
  const queryText = str(input.queryText, 500);
  const candidateCount = int(input.candidateCount, 10_000);
  const estimatedCostUsd = num(input.estimatedCostUsd, 1_000);
  const pricingVersion = str(input.pricingVersion, 50);
  const errorCategory = ERROR_CATEGORIES.find((c) => c === input.errorCategory);
  const inputTokens = sumTokens(usage, 'inputTokens');
  const outputTokens = sumTokens(usage, 'outputTokens');

  const stageModels: Partial<Record<Stage, string>> = {};
  if (isObject(input.stageModels)) {
    for (const stage of STAGES) {
      const m = str(input.stageModels[stage], 100);
      if (m) stageModels[stage] = m;
    }
  }

  const costBreakdownUsd: Partial<Record<Stage, number>> = {};
  if (isObject(input.costBreakdownUsd)) {
    for (const stage of STAGES) {
      const c = num(input.costBreakdownUsd[stage], 1_000);
      if (c !== undefined) costBreakdownUsd[stage] = c;
    }
  }

  return {
    schemaVersion: 1,
    queryId,
    timestamp: new Date(parsedTime).toISOString(),
    status,
    model,
    retrievalMethod,
    chunks,
    timings,
    usage,
    ...(Object.keys(stageModels).length > 0 ? { stageModels } : {}),
    ...(queryText ? { queryText } : {}),
    ...(candidateCount !== undefined ? { candidateCount } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    ...(Object.keys(costBreakdownUsd).length > 0 ? { costBreakdownUsd } : {}),
    ...(pricingVersion ? { pricingVersion } : {}),
    ...(errorCategory ? { errorCategory } : {}),
  };
}
