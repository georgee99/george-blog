import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { isAuthorised, json } from './http';
import { putFeedback } from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!isAuthorised(event)) return json(401, { error: 'Unauthorized' });
  const raw = event.body ?? '';
  if (Buffer.byteLength(raw) > 1024) return json(413, { error: 'Payload too large' });
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid body');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  const { queryId, timestamp, rating } = input;
  if (typeof queryId !== 'string' || !UUID_RE.test(queryId) ||
      typeof timestamp !== 'string' || !TIMESTAMP_RE.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) ||
      (rating !== 'up' && rating !== 'down')) return json(400, { error: 'Invalid feedback' });
  try {
    const result = await putFeedback(queryId, timestamp, rating);
    return result === 'saved' ? json(200, { ok: true })
      : result === 'missing' ? json(404, { error: 'Query not found' })
      : json(409, { error: 'Already rated' });
  } catch (err) {
    console.error('Failed to save feedback:', err);
    return json(500, { error: 'Failed to save feedback' });
  }
};
