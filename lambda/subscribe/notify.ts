import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Subscriber } from './db';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

function getTableName(): string {
  const name = process.env.SUBSCRIBERS_TABLE_NAME;
  if (!name) throw new Error('SUBSCRIBERS_TABLE_NAME environment variable is not set');
  return name;
}

function getSenderEmail(): string {
  const email = process.env.SES_SENDER_EMAIL;
  if (!email) throw new Error('SES_SENDER_EMAIL environment variable is not set');
  return email;
}

interface NotifyPayload {
  subject: string;
  body: string;
  html?: string;
}

async function getConfirmedSubscribers(): Promise<Subscriber[]> {
  const subscribers: Subscriber[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: getTableName(),
        FilterExpression: '#s = :confirmed',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':confirmed': 'confirmed' },
        ExclusiveStartKey: lastKey,
      }),
    );
    subscribers.push(...((result.Items ?? []) as Subscriber[]));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return subscribers;
}

export const handler = async (event: NotifyPayload): Promise<{ sent: number; emails: string[] }> => {
  const { subject, body, html } = event;

  if (!subject || !body) {
    throw new Error('Payload must include "subject" and "body"');
  }

  const subscribers = await getConfirmedSubscribers();

  if (subscribers.length === 0) {
    console.log('No confirmed subscribers found.');
    return { sent: 0, emails: [] };
  }

  console.log(`Sending to ${subscribers.length} confirmed subscriber(s)...`);

  const sent: string[] = [];

  for (const sub of subscribers) {
    const message = html
      ? {
          Subject: { Data: subject },
          Body: { Text: { Data: body }, Html: { Data: html } },
        }
      : {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        };

    await ses.send(
      new SendEmailCommand({
        Source: getSenderEmail(),
        Destination: { ToAddresses: [sub.email] },
        Message: message,
      }),
    );
    sent.push(sub.email);
    console.log(`Sent to ${sub.email}`);
  }

  return { sent: sent.length, emails: sent };
};
