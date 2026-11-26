import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { QueryStatus, RagQueryRecord, StoredRecord } from './types';
import { dayInZone, type AnalyticsTimeZone } from './dates';

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

function getTableName(): string {
  const name = process.env.TABLE_NAME;
  if (!name) throw new Error('TABLE_NAME environment variable is not set');
  return name;
}

function retentionDays(): number {
  const n = Number.parseInt(process.env.RETENTION_DAYS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 92;

export function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export async function putRecord(record: RagQueryRecord): Promise<'created' | 'duplicate'> {
  const item: StoredRecord = {
    ...record,
    pk: record.timestamp.slice(0, 10),
    sk: `${record.timestamp}#${record.queryId}`,
    chunkCount: record.chunks.length,
    expiresAt: Math.floor(Date.now() / 1000) + retentionDays() * 86400,
  };

  try {
    await getDocClient().send(
      new PutCommand({
        TableName: getTableName(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return 'created';
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return 'duplicate';
    throw err;
  }
}

function toPublic(item: StoredRecord): RagQueryRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pk, sk, expiresAt, chunkCount, ...record } = item;
  return record;
}

export async function getRecord(queryId: string): Promise<RagQueryRecord | null> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'byQueryId',
      KeyConditionExpression: 'queryId = :id',
      ExpressionAttributeValues: { ':id': queryId },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0] as StoredRecord | undefined;
  return item ? toPublic(item) : null;
}

export async function putFeedback(queryId: string, timestamp: string, rating: 'up' | 'down'): Promise<'saved' | 'missing' | 'duplicate'> {
  const key = { pk: timestamp.slice(0, 10), sk: `${timestamp}#${queryId}` };
  const existing = await getDocClient().send(new GetCommand({ TableName: getTableName(), Key: key, ConsistentRead: true }));
  if (!existing.Item || existing.Item.status !== 'success' || existing.Item.expiresAt <= Math.floor(Date.now() / 1000)) return 'missing';
  try {
    await getDocClient().send(new UpdateCommand({
      TableName: getTableName(),
      Key: key,
      UpdateExpression: 'SET #feedback = :rating',
      ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(#feedback) AND #status = :success AND expiresAt > :now',
      ExpressionAttributeNames: { '#status': 'status', '#feedback': 'feedback' },
      ExpressionAttributeValues: { ':rating': rating, ':success': 'success', ':now': Math.floor(Date.now() / 1000) },
    }));
    return 'saved';
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return 'duplicate';
    throw err;
  }
}

export interface Filters {
  status?: QueryStatus;
  model?: string;
  feedback?: 'up' | 'down';
}

function filterParams(filters: Filters) {
  const parts: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  if (filters.status) {
    parts.push('#status = :status');
    names['#status'] = 'status';
    values[':status'] = filters.status;
  }
  if (filters.model) {
    parts.push('#model = :model');
    names['#model'] = 'model';
    values[':model'] = filters.model;
  }
  if (filters.feedback) {
    parts.push('#feedback = :feedback');
    names['#feedback'] = 'feedback';
    values[':feedback'] = filters.feedback;
  }
  return {
    FilterExpression: parts.length > 0 ? parts.join(' AND ') : undefined,
    names,
    values,
  };
}

async function queryDay(
  day: string,
  filters: Filters,
  limit: number | undefined,
  startKey: Record<string, unknown> | undefined,
  bounds: { start: string; end: string },
) {
  const f = filterParams(filters);
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      FilterExpression: f.FilterExpression,
      ExpressionAttributeNames: Object.keys(f.names).length > 0 ? f.names : undefined,
      ExpressionAttributeValues: { ':pk': day, ':start': bounds.start, ':end': bounds.end, ...f.values },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: startKey,
    }),
  );
  return {
    items: (result.Items ?? []) as StoredRecord[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export interface QuerySummaryRow {
  queryId: string;
  timestamp: string;
  queryText?: string;
  model: string;
  retrievalMethod: string;
  status: QueryStatus;
  totalMs: number;
  chunkCount: number;
  errorCategory?: string;
  feedback?: 'up' | 'down';
}

export interface Cursor {
  pk: string;
  key?: Record<string, unknown>;
}

// Newest first across days; the cursor remembers the day and DynamoDB's position within it.
export async function listQueries(
  days: string[],
  filters: Filters,
  limit: number,
  bounds: { start: string; end: string },
  cursor?: Cursor,
): Promise<{ items: QuerySummaryRow[]; nextCursor?: Cursor }> {
  const ordered = [...days].reverse();
  let dayIndex = 0;
  if (cursor) {
    dayIndex = ordered.indexOf(cursor.pk);
    if (dayIndex < 0) throw new Error('Invalid cursor');
  }

  const rows: QuerySummaryRow[] = [];
  let startKey = cursor?.key;

  for (; dayIndex < ordered.length; dayIndex++) {
    do {
      const { items, lastKey } = await queryDay(ordered[dayIndex], filters, limit - rows.length, startKey, bounds);
      for (const i of items) {
        rows.push({
          queryId: i.queryId,
          timestamp: i.timestamp,
          ...(i.queryText ? { queryText: i.queryText } : {}),
          model: i.model,
          retrievalMethod: i.retrievalMethod,
          status: i.status,
          totalMs: i.timings.totalMs,
          chunkCount: i.chunkCount ?? i.chunks.length,
          ...(i.errorCategory ? { errorCategory: i.errorCategory } : {}),
          ...(i.feedback ? { feedback: i.feedback } : {}),
        });
      }
      startKey = lastKey;

      if (rows.length >= limit) {
        if (lastKey) return { items: rows, nextCursor: { pk: ordered[dayIndex], key: lastKey } };
        if (dayIndex + 1 < ordered.length) return { items: rows, nextCursor: { pk: ordered[dayIndex + 1] } };
        return { items: rows };
      }
    } while (startKey);
  }

  return { items: rows };
}

export interface DailyPoint {
  day: string;
  queries: number;
  failures: number;
  avgTotalMs: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface Summary {
  totals: {
    queries: number;
    success: number;
    failure: number;
    failureRate: number | null;
    avgTotalMs: number | null;
    p95TotalMs: number | null;
    avgRetrievalMs: number | null;
    avgGenerationMs: number | null;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    // How many queries the token and cost totals are based on.
    queriesWithUsage: number;
    queriesWithCost: number;
    positiveFeedback: number;
    negativeFeedback: number;
  };
  daily: DailyPoint[];
}

function avg(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export async function summarise(
  days: string[],
  utcDays: string[],
  filters: Filters,
  bounds: { start: string; end: string },
  timeZone: AnalyticsTimeZone,
): Promise<Summary> {
  const totalMs: number[] = [];
  const retrievalMs: number[] = [];
  const generationMs: number[] = [];
  const totals = {
    queries: 0,
    success: 0,
    failure: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    queriesWithUsage: 0,
    queriesWithCost: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
  };
  const daily: DailyPoint[] = days.map((day) => ({
      day,
      queries: 0,
      failures: 0,
      avgTotalMs: null,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
  }));
  const byDay = new Map(daily.map((point) => [point.day, point]));
  const dailyMs = new Map(days.map((day) => [day, [] as number[]]));

  for (const day of utcDays) {
    let startKey: Record<string, unknown> | undefined;
    do {
      const { items, lastKey } = await queryDay(day, filters, undefined, startKey, bounds);
      startKey = lastKey;

      for (const i of items) {
        const localDay = dayInZone(i.timestamp, timeZone);
        const point = byDay.get(localDay);
        const dayMs = dailyMs.get(localDay);
        if (!point || !dayMs) throw new Error('Record outside analytics range');
        point.queries++;
        totals.queries++;
        if (i.feedback === 'up') totals.positiveFeedback++;
        if (i.feedback === 'down') totals.negativeFeedback++;
        if (i.status === 'success') totals.success++;
        else {
          totals.failure++;
          point.failures++;
        }

        dayMs.push(i.timings.totalMs);
        totalMs.push(i.timings.totalMs);
        if (i.timings.retrievalMs !== undefined) retrievalMs.push(i.timings.retrievalMs);
        if (i.timings.generationMs !== undefined) generationMs.push(i.timings.generationMs);

        if (i.inputTokens !== undefined || i.outputTokens !== undefined) {
          totals.queriesWithUsage++;
          totals.inputTokens += i.inputTokens ?? 0;
          totals.outputTokens += i.outputTokens ?? 0;
          point.inputTokens += i.inputTokens ?? 0;
          point.outputTokens += i.outputTokens ?? 0;
        }
        if (i.estimatedCostUsd !== undefined) {
          totals.queriesWithCost++;
          totals.estimatedCostUsd += i.estimatedCostUsd;
          point.estimatedCostUsd += i.estimatedCostUsd;
        }
      }
    } while (startKey);

  }
  for (const point of daily) point.avgTotalMs = avg(dailyMs.get(point.day)!);

  return {
    totals: {
      ...totals,
      failureRate: totals.queries > 0 ? totals.failure / totals.queries : null,
      avgTotalMs: avg(totalMs),
      p95TotalMs: percentile(totalMs, 0.95),
      avgRetrievalMs: avg(retrievalMs),
      avgGenerationMs: avg(generationMs),
    },
    daily,
  };
}
