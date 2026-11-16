import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, timingSafeEqual } from 'crypto';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function authorised(event: APIGatewayProxyEvent): boolean {
  const expected = process.env.MODERATION_API_KEY;
  const provided = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === 'x-api-key')?.[1];
  if (!expected || !provided) return false;
  return timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(provided).digest());
}

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error('DYNAMODB_TABLE_NAME is not set');
  return name;
}

interface Key {
  postSlug: string;
  commentId: string;
}

function validKey(value: unknown): value is Key & Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const key = value as Record<string, unknown>;
  return typeof key.postSlug === 'string' && key.postSlug.trim() !== '' && Buffer.byteLength(key.postSlug) <= 2048 &&
    typeof key.commentId === 'string' && key.commentId.trim() !== '' && Buffer.byteLength(key.commentId) <= 1024;
}

type SortOrder = 'newest' | 'oldest';

interface SortKey extends Key {
  timestamp: number;
}

interface ListCursor extends SortKey {
  version: 1;
  type: string;
  status: string;
  sort: SortOrder;
  blogsHash?: string;
}

interface ListItem extends SortKey {
  author: string;
  content: string;
  createdAt: string;
  parentId?: string;
  isHidden: boolean;
}

function decodeCursor(cursor: string): ListCursor | undefined {
  if (cursor.length > 5000 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return undefined;
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!validKey(key)) return undefined;
    const data = key;
    if (data.version !== 1 || typeof data.timestamp !== 'number' || !Number.isFinite(data.timestamp) ||
        typeof data.type !== 'string' || typeof data.status !== 'string' ||
        (data.sort !== 'newest' && data.sort !== 'oldest') ||
        (data.blogsHash !== undefined && (typeof data.blogsHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.blogsHash)))) return undefined;
    return {
      version: 1, postSlug: key.postSlug, commentId: key.commentId, timestamp: data.timestamp,
      type: data.type, status: data.status, sort: data.sort,
      ...(data.blogsHash ? { blogsHash: data.blogsHash } : {}),
    };
  } catch {
    return undefined;
  }
}

function compareKeys(a: SortKey, b: SortKey, sort: SortOrder): number {
  const compareString = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const result = Math.sign(a.timestamp - b.timestamp) ||
    compareString(a.postSlug, b.postSlug) || compareString(a.commentId, b.commentId);
  return sort === 'oldest' ? result : -result;
}

async function list(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const params = event.queryStringParameters ?? {};
  const type = params.type ?? 'all';
  const status = params.status ?? 'all';
  const sort = params.sort ?? 'newest';
  if (!['all', 'blog', 'guestbook'].includes(type) || !['all', 'visible', 'hidden'].includes(status) ||
      (sort !== 'newest' && sort !== 'oldest')) {
    return json(400, { error: 'Invalid moderation filter.' });
  }
  let blogs: string[] = [];
  if (params.blogs !== undefined) {
    try {
      const parsed: unknown = JSON.parse(params.blogs);
      if (!Array.isArray(parsed) || parsed.some((slug) => typeof slug !== 'string' ||
          !slug.trim() || slug === 'guestbook' || Buffer.byteLength(slug) > 2048)) {
        return json(400, { error: 'Invalid blog filter.' });
      }
      blogs = [...new Set(parsed)].sort();
    } catch {
      return json(400, { error: 'Invalid blog filter.' });
    }
  }
  const blogSet = new Set(blogs);
  const blogsHash = blogs.length ? createHash('sha256').update(JSON.stringify(blogs)).digest('hex') : undefined;
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  if (params.cursor && (!cursor || cursor.type !== type || cursor.status !== status ||
      cursor.sort !== sort || cursor.blogsHash !== blogsHash)) {
    return json(400, { error: 'Invalid cursor.' });
  }

  const pageSize = 30;
  const items: ListItem[] = [];
  const availableBlogs = new Set<string>();
  let scanKey: Record<string, unknown> | undefined;
  const signal = AbortSignal.timeout(16_000);
  do {
    const result = await db.send(new ScanCommand({
      TableName: tableName(),
      ConsistentRead: true,
      ExclusiveStartKey: scanKey,
      ProjectionExpression: '#slug, #id, #author, #content, #created, #parent, #hidden',
      ExpressionAttributeNames: {
        '#slug': 'postSlug', '#id': 'commentId', '#author': 'author', '#content': 'content',
        '#created': 'createdAt', '#parent': 'parentId', '#hidden': 'isHidden',
      },
    }), { abortSignal: signal });
    for (const raw of result.Items ?? []) {
      if (!validKey(raw)) throw new Error('Comments table contains an entry with invalid keys.');
      if (raw.postSlug !== 'guestbook') availableBlogs.add(raw.postSlug);
      if ((type === 'blog' && raw.postSlug === 'guestbook') ||
          (type === 'guestbook' && raw.postSlug !== 'guestbook') ||
          (status === 'hidden' && raw.isHidden !== true) ||
          (status === 'visible' && raw.isHidden !== undefined && raw.isHidden !== false) ||
          (blogSet.size > 0 && !blogSet.has(raw.postSlug))) continue;
      if (typeof raw.author !== 'string' || typeof raw.content !== 'string' ||
          typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt)) ||
          (raw.parentId !== undefined && typeof raw.parentId !== 'string')) {
        throw new Error('Comments table contains an entry with invalid fields.');
      }
      const item: ListItem = {
        postSlug: raw.postSlug, commentId: raw.commentId, author: raw.author, content: raw.content,
        createdAt: raw.createdAt, timestamp: Date.parse(raw.createdAt),
        ...(raw.parentId ? { parentId: raw.parentId } : {}), isHidden: raw.isHidden === true,
      };
      if (cursor && compareKeys(item, cursor, sort) <= 0) continue;
      const position = items.findIndex((other) => compareKeys(item, other, sort) < 0);
      if (position === -1) {
        if (items.length <= pageSize) items.push(item);
      } else {
        items.splice(position, 0, item);
        if (items.length > pageSize + 1) items.pop();
      }
    }
    scanKey = result.LastEvaluatedKey;
  } while (scanKey);
  const hasNext = items.length > pageSize;
  const page = items.slice(0, pageSize);
  const last = page[page.length - 1];
  const nextCursor: ListCursor | undefined = hasNext && last ? {
    version: 1, postSlug: last.postSlug, commentId: last.commentId, timestamp: last.timestamp, type, status, sort,
    ...(blogsHash ? { blogsHash } : {}),
  } : undefined;
  return json(200, {
    items: page.map(({ timestamp: _timestamp, ...item }) => item),
    availableBlogs: [...availableBlogs].sort(),
    ...(nextCursor ? { nextCursor: Buffer.from(JSON.stringify(nextCursor)).toString('base64url') } : {}),
  });
}

async function hasReplies(key: Key): Promise<boolean> {
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'postSlug = :slug',
      FilterExpression: 'parentId = :parent',
      ExpressionAttributeValues: { ':slug': key.postSlug, ':parent': key.commentId },
      Select: 'COUNT',
      ConsistentRead: true,
      ExclusiveStartKey: cursor,
    }));
    if ((result.Count ?? 0) > 0) return true;
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return false;
}

async function mutate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  if (!validKey(body)) return json(400, { error: 'Invalid entry identifier.' });
  const key: Key = { postSlug: body.postSlug, commentId: body.commentId };
  const action = (body as Key & { action?: unknown }).action;
  if (action !== 'hide' && action !== 'restore' && action !== 'delete') {
    return json(400, { error: 'Invalid moderation action.' });
  }

  if (action !== 'delete') {
    try {
      await db.send(new UpdateCommand({
        TableName: tableName(),
        Key: key,
        ConditionExpression: 'attribute_exists(postSlug)',
        UpdateExpression: action === 'hide' ? 'SET isHidden = :hidden' : 'REMOVE isHidden',
        ...(action === 'hide' ? { ExpressionAttributeValues: { ':hidden': true } } : {}),
      }));
      return json(200, { ok: true });
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return json(404, { error: 'Entry not found.' });
      }
      throw error;
    }
  }

  const existing = await db.send(new GetCommand({ TableName: tableName(), Key: key, ConsistentRead: true }));
  if (!existing.Item) return json(404, { error: 'Entry not found.' });
  if (await hasReplies(key)) {
    return json(409, { error: 'This entry has replies. Delete its replies before deleting it.' });
  }
  const version = existing.Item.replyVersion;
  try {
    await db.send(new DeleteCommand({
      TableName: tableName(),
      Key: key,
      ConditionExpression: typeof version === 'number'
        ? 'attribute_exists(postSlug) AND replyVersion = :version'
        : 'attribute_exists(postSlug) AND attribute_not_exists(replyVersion)',
      ...(typeof version === 'number' ? { ExpressionAttributeValues: { ':version': version } } : {}),
    }));
    return json(200, { ok: true });
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return json(409, { error: 'The entry changed or received a reply. Refresh and try again.' });
    }
    throw error;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!authorised(event)) return json(401, { error: 'Unauthorized' });
  try {
    if (event.httpMethod === 'GET') return await list(event);
    if (event.httpMethod === 'POST') return await mutate(event);
    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('Moderation operation failed:', error);
    return json(500, { error: 'Moderation service failed.' });
  }
};
