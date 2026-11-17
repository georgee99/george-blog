import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const statuses = ['pending', 'confirmed', 'unsubscribed', 'bounced', 'complained'] as const;

function json(statusCode: number, body: object): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function authorised(event: APIGatewayProxyEvent): boolean {
  const expected = process.env.SUBSCRIBER_ADMIN_API_KEY;
  const actual = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === 'x-api-key')?.[1];
  if (!expected || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encodeCursor(value: Record<string, unknown>, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decodeCursor(cursor: string, secret: string): unknown {
  const bytes = Buffer.from(cursor, 'base64url');
  if (bytes.length < 29 || bytes.length > 2048) throw new Error('Invalid cursor');
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!authorised(event)) return json(401, { error: 'Unauthorized' });
  const cursorSecret = process.env.SUBSCRIBER_ADMIN_API_KEY!;
  const table = process.env.SUBSCRIBERS_TABLE_NAME;
  if (!table) {
    console.error('SUBSCRIBERS_TABLE_NAME is not set');
    return json(503, { error: 'Subscriber service is not configured' });
  }
  const params = event.queryStringParameters ?? {};
  const mode = params.mode ?? 'list';
  if (!['list', 'summary', 'health', 'history'].includes(mode)) return json(400, { error: 'Invalid mode' });
  if (mode === 'history') {
    const historyTable = process.env.NEWSLETTER_HISTORY_TABLE_NAME;
    if (!historyTable) return json(503, { error: 'Newsletter history is not configured' });
    let historyKey: { campaignId: string; history: string; startedAt: string } | undefined;
    if (params.cursor) {
      try {
        const key = decodeCursor(params.cursor, cursorSecret);
        if (!key || typeof key !== 'object' || !('campaignId' in key) || typeof key.campaignId !== 'string' ||
            !('history' in key) || key.history !== 'newsletter' || !('startedAt' in key) || typeof key.startedAt !== 'string') {
          return json(400, { error: 'Invalid cursor' });
        }
        historyKey = { campaignId: key.campaignId, history: key.history, startedAt: key.startedAt };
      } catch {
        return json(400, { error: 'Invalid cursor' });
      }
    }
    try {
      const page = await dynamo.send(new QueryCommand({
        TableName: historyTable, IndexName: 'byStartTime',
        KeyConditionExpression: '#history = :history',
        ExpressionAttributeNames: { '#history': 'history' },
        ExpressionAttributeValues: { ':history': 'newsletter' },
        ScanIndexForward: false, Limit: 30, ExclusiveStartKey: historyKey,
      }));
      return json(200, {
        items: page.Items ?? [],
        ...(page.LastEvaluatedKey ? { nextCursor: encodeCursor(page.LastEvaluatedKey, cursorSecret) } : {}),
      });
    } catch (error) {
      console.error('Failed to read newsletter history:', error);
      return json(500, { error: 'Failed to read newsletter history' });
    }
  }
  let startKey: { email: string } | undefined;
  if (params.cursor) {
    try {
      const decoded = decodeCursor(params.cursor, cursorSecret);
      if (!decoded || typeof decoded !== 'object' || !('email' in decoded) || typeof decoded.email !== 'string' || !decoded.email) {
        return json(400, { error: 'Invalid cursor' });
      }
      startKey = { email: decoded.email };
    } catch {
      return json(400, { error: 'Invalid cursor' });
    }
  }
  try {
    if (mode === 'health') {
      await dynamo.send(new ScanCommand({ TableName: table, Limit: 1, Select: 'COUNT' }));
      return json(200, { ok: true });
    }
    if (mode === 'summary') {
      const counts: Record<string, number> = Object.fromEntries([...statuses, 'unknown'].map((status) => [status, 0]));
      let key: Record<string, unknown> | undefined;
      do {
        const page = await dynamo.send(new ScanCommand({
          TableName: table, ProjectionExpression: '#s', ExpressionAttributeNames: { '#s': 'status' }, ExclusiveStartKey: key,
        }));
        for (const item of page.Items ?? []) {
          const status = typeof item.status === 'string' && statuses.some((value) => value === item.status) ? item.status : 'unknown';
          counts[status]++;
        }
        key = page.LastEvaluatedKey;
      } while (key);
      return json(200, { counts, fetchedAt: new Date().toISOString() });
    }
    const page = await dynamo.send(new ScanCommand({
      TableName: table, Limit: 50, ExclusiveStartKey: startKey,
      ProjectionExpression: 'email, #s, createdAt, confirmedAt, #source',
      ExpressionAttributeNames: { '#s': 'status', '#source': 'source' },
    }));
    return json(200, {
      items: page.Items ?? [],
      ...(page.LastEvaluatedKey ? { nextCursor: encodeCursor(page.LastEvaluatedKey, cursorSecret) } : {}),
    });
  } catch (error) {
    console.error('Failed to read subscriber data:', error);
    return json(500, { error: 'Failed to read subscriber data' });
  }
};
