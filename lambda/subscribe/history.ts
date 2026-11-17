import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tableName(): string {
  const table = process.env.NEWSLETTER_HISTORY_TABLE_NAME;
  if (!table) throw new Error('NEWSLETTER_HISTORY_TABLE_NAME is not set');
  return table;
}

export async function beginRun(subject: string, campaignId?: string, postSlug?: string): Promise<string> {
  const id = campaignId ?? randomUUID();
  await dynamo.send(new PutCommand({
    TableName: tableName(),
    Item: {
      campaignId: id, history: 'newsletter', startedAt: new Date().toISOString(),
      subject, ...(postSlug ? { postSlug } : {}),
      status: 'in_progress', total: null, attempted: 0, accepted: 0,
    },
    ConditionExpression: 'attribute_not_exists(campaignId)',
  }));
  return id;
}

export async function updateRun(id: string, values: {
  status: 'in_progress' | 'completed' | 'failed';
  total: number | null;
  attempted: number;
  accepted: number;
}): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: tableName(),
    Key: { campaignId: id },
    UpdateExpression: 'SET #status = :status, #total = :total, attempted = :attempted, accepted = :accepted, updatedAt = :updatedAt',
    ConditionExpression: 'attribute_exists(campaignId)',
    ExpressionAttributeNames: { '#status': 'status', '#total': 'total' },
    ExpressionAttributeValues: {
      ':status': values.status, ':total': values.total, ':attempted': values.attempted,
      ':accepted': values.accepted, ':updatedAt': new Date().toISOString(),
    },
  }));
}
