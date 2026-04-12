import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
}

export async function getComments(postSlug: string): Promise<DynamoComment[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'postSlug = :slug',
      ExpressionAttributeValues: { ':slug': postSlug },
      ScanIndexForward: true, // commentId is time-sortable; ascending = oldest first
    }),
  );
  return (result.Items ?? []) as DynamoComment[];
}

export async function insertComment(
  postSlug: string,
  author: string,
  content: string,
): Promise<DynamoComment> {
  const createdAt = new Date().toISOString();
  const commentId = `${createdAt}#${randomUUID()}`;

  const item: DynamoComment = {
    postSlug,
    commentId,
    author,
    content,
    createdAt,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: item,
    }),
  );

  return item;
}
