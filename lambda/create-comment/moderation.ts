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

function validKey(value: unknown): value is Key {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const key = value as Record<string, unknown>;
  return typeof key.postSlug === 'string' && key.postSlug.trim() !== '' && Buffer.byteLength(key.postSlug) <= 2048 &&
    typeof key.commentId === 'string' && key.commentId.trim() !== '' && Buffer.byteLength(key.commentId) <= 1024;
}

function decodeCursor(cursor: string): Key | undefined {
  if (cursor.length > 5000 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return undefined;
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return validKey(key) ? { postSlug: key.postSlug, commentId: key.commentId } : undefined;
  } catch {
    return undefined;
  }
}

async function list(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const params = event.queryStringParameters ?? {};
  const type = params.type ?? 'all';
  const status = params.status ?? 'all';
  if (!['all', 'blog', 'guestbook'].includes(type) || !['all', 'visible', 'hidden'].includes(status)) {
    return json(400, { error: 'Invalid moderation filter.' });
  }
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
  if (params.cursor && !cursor) return json(400, { error: 'Invalid cursor.' });

  const filters: string[] = [];
  const values: Record<string, unknown> = {};
  if (type !== 'all') {
    filters.push(type === 'guestbook' ? 'postSlug = :guestbook' : 'postSlug <> :guestbook');
    values[':guestbook'] = 'guestbook';
  }
  if (status === 'hidden') {
    filters.push('isHidden = :hidden');
    values[':hidden'] = true;
  } else if (status === 'visible') {
    filters.push('(attribute_not_exists(isHidden) OR isHidden = :visible)');
    values[':visible'] = false;
  }

  const result = await db.send(new ScanCommand({
    TableName: tableName(),
    Limit: 30,
    ConsistentRead: true,
    ExclusiveStartKey: cursor,
    ...(filters.length ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: values } : {}),
    ProjectionExpression: '#slug, #id, #author, #content, #created, #parent, #hidden',
    ExpressionAttributeNames: {
      '#slug': 'postSlug', '#id': 'commentId', '#author': 'author', '#content': 'content',
      '#created': 'createdAt', '#parent': 'parentId', '#hidden': 'isHidden',
    },
  }));
  const items = (result.Items ?? []).map((item) => ({
    postSlug: item.postSlug,
    commentId: item.commentId,
    author: item.author,
    content: item.content,
    createdAt: item.createdAt,
    ...(item.parentId ? { parentId: item.parentId } : {}),
    isHidden: item.isHidden === true,
  })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json(200, {
    items,
    ...(result.LastEvaluatedKey ? { nextCursor: Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') } : {}),
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
