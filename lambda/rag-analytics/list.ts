import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { isAuthorised, json } from './http';
import { enumerateDays, listQueries, MAX_RANGE_DAYS, summarise, type Cursor, type Filters } from './db';
import { dateBounds, dayInZone, type AnalyticsTimeZone } from './dates';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function validDay(v: string | undefined): v is string {
  return typeof v === 'string' && DAY_RE.test(v) && Number.isFinite(Date.parse(v));
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof c?.pk !== 'string' || !DAY_RE.test(c.pk)) return null;
    if (c.key !== undefined && (c.key.pk !== c.pk || typeof c.key.sk !== 'string')) return null;
    return c;
  } catch {
    return null;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!isAuthorised(event)) return json(401, { error: 'Unauthorized' });

  const q = event.queryStringParameters ?? {};
  if (q.timeZone !== undefined && q.timeZone !== 'UTC' && q.timeZone !== 'Australia/Sydney') {
    return json(400, { error: 'Invalid time zone' });
  }
  const timeZone: AnalyticsTimeZone = q.timeZone ?? 'UTC';
  const today = dayInZone(Date.now(), timeZone);
  const to = q.to ?? today;
  const from = q.from ?? new Date(Date.parse(to) - 6 * DAY_MS).toISOString().slice(0, 10);

  if (!validDay(from) || !validDay(to) || from > to) {
    return json(400, { error: 'from and to must be YYYY-MM-DD dates with from <= to' });
  }
  const days = enumerateDays(from, to);
  if (days.length > MAX_RANGE_DAYS) {
    return json(400, { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` });
  }
  const bounds = dateBounds(from, to, timeZone);
  const utcDays = enumerateDays(bounds.start.slice(0, 10), new Date(Date.parse(bounds.end) - 1).toISOString().slice(0, 10));

  const filters: Filters = {};
  if (q.status !== undefined) {
    if (q.status !== 'success' && q.status !== 'failure') return json(400, { error: 'Invalid status' });
    filters.status = q.status;
  }
  if (q.model) filters.model = q.model.slice(0, 100);
  if (q.feedback !== undefined) {
    if (q.feedback !== 'up' && q.feedback !== 'down') return json(400, { error: 'Invalid feedback' });
    filters.feedback = q.feedback;
  }

  try {
    if (event.path.endsWith('/summary')) {
      return json(200, { range: { from, to }, ...(await summarise(days, utcDays, filters, bounds, timeZone)) });
    }

    const limit = Math.min(Math.max(Number.parseInt(q.limit ?? '25', 10) || 25, 1), 100);
    let cursor: Cursor | undefined;
    if (q.cursor) {
      cursor = decodeCursor(q.cursor) ?? undefined;
      if (!cursor) return json(400, { error: 'Invalid cursor' });
    }

    const { items, nextCursor } = await listQueries(utcDays, filters, limit, bounds, cursor);
    return json(200, { items, ...(nextCursor ? { nextCursor: encodeCursor(nextCursor) } : {}) });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') return json(400, { error: 'Invalid cursor' });
    console.error('Failed to read analytics:', err);
    return json(500, { error: 'Failed to read analytics' });
  }
};
