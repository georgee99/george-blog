import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  return docClient;
}

function getTableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
  return name;
}

export interface DynamoComment {
  postSlug: string;
  commentId: string;
  author: string;
  content: string;
  createdAt: string;
  parentId?: string;
  reactions?: Record<string, number>;
  ipHash?: string;
  userAgent?: string;
  clientId?: string;
}

export async function getComments(postSlug: string): Promise<DynamoComment[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'postSlug = :slug',
      ExpressionAttributeValues: { ':slug': postSlug },
      ScanIndexForward: false, 
    }),
  );
  return (result.Items ?? []) as DynamoComment[];
}

export async function insertComment(
  postSlug: string,
  author: string,
  content: string,
  parentId?: string,
  ipHash?: string,
  userAgent?: string,
  clientId?: string,
): Promise<DynamoComment> {
  const createdAt = new Date().toISOString();
  const commentId = `${createdAt}#${randomUUID()}`;

  const item: DynamoComment = {
    postSlug,
    commentId,
    author,
    content,
    createdAt,
    reactions: {},
    ...(parentId ? { parentId } : {}),
    ...(ipHash ? { ipHash } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(clientId ? { clientId } : {}),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: item,
    }),
  );

  return {
    postSlug: item.postSlug,
    commentId: item.commentId,
    author: item.author,
    content: item.content,
    createdAt: item.createdAt,
    reactions: item.reactions,
    ...(item.parentId ? { parentId: item.parentId } : {}),
  };
}

export async function addReaction(
  postSlug: string,
  commentId: string,
  emoji: string,
): Promise<Record<string, number>> {
  const client = getDocClient();
  const TableName = getTableName();

  // Ensure the reactions map attribute exists (handles comments created before this feature)
  await client.send(
    new UpdateCommand({
      TableName,
      Key: { postSlug, commentId },
      UpdateExpression: 'SET reactions = if_not_exists(reactions, :empty)',
      ExpressionAttributeValues: { ':empty': {} },
    }),
  );

  // Atomically increment the specific emoji count
  const result = await client.send(
    new UpdateCommand({
      TableName,
      Key: { postSlug, commentId },
      UpdateExpression: 'SET reactions.#emoji = if_not_exists(reactions.#emoji, :zero) + :one',
      ExpressionAttributeNames: { '#emoji': emoji },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
      ReturnValues: 'ALL_NEW',
    }),
  );

  return (result.Attributes?.reactions ?? {}) as Record<string, number>;
}

export async function removeReaction(
  postSlug: string,
  commentId: string,
  emoji: string,
): Promise<Record<string, number>> {
  try {
    const result = await getDocClient().send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { postSlug, commentId },
        UpdateExpression: 'SET reactions.#emoji = reactions.#emoji - :one',
        ConditionExpression: 'reactions.#emoji >= :one',
        ExpressionAttributeNames: { '#emoji': emoji },
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (result.Attributes?.reactions ?? {}) as Record<string, number>;
  } catch (err: unknown) {
    // Count was already 0 — ignore
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return {};
    }
    throw err;
  }
}
