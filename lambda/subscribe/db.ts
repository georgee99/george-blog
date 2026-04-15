import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  return docClient;
}

function getTableName(): string {
  const name = process.env.SUBSCRIBERS_TABLE_NAME;
  if (!name) throw new Error('SUBSCRIBERS_TABLE_NAME environment variable is not set');
  return name;
}

export interface Subscriber {
  email: string;
  status: 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained';
  confirmationToken: string;
  createdAt: string;
  confirmedAt: string | null;
  source: string | null;
}

export async function getSubscriber(email: string): Promise<Subscriber | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: getTableName(),
      Key: { email },
    }),
  );
  return (result.Item as Subscriber) ?? null;
}

export async function putSubscriber(subscriber: Subscriber): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: subscriber,
    }),
  );
}

export async function confirmSubscriber(
  email: string,
  confirmedAt: string,
): Promise<void> {
  await getDocClient().send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { email },
      UpdateExpression: 'SET #s = :confirmed, confirmedAt = :confirmedAt',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':confirmed': 'confirmed',
        ':confirmedAt': confirmedAt,
      },
    }),
  );
}

export async function setSubscriberStatus(
  email: string,
  status: 'unsubscribed' | 'bounced' | 'complained',
): Promise<void> {
  await getDocClient().send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { email },
      UpdateExpression: 'SET #s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
    }),
  );
}
