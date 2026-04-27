import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Resend } from 'resend';
import { Subscriber } from './db';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const resend = new Resend(process.env.RESEND_API_KEY);

function getTableName(): string {
  const name = process.env.SUBSCRIBERS_TABLE_NAME;
  if (!name) throw new Error('SUBSCRIBERS_TABLE_NAME environment variable is not set');
  return name;
}

function getFromEmail(): string {
  const email = process.env.RESEND_FROM_EMAIL;
  if (!email) throw new Error('RESEND_FROM_EMAIL environment variable is not set');
  return email;
}

function getSiteBaseUrl(): string {
  const url = process.env.SITE_BASE_URL;
  if (!url) throw new Error('SITE_BASE_URL environment variable is not set');
  return url.replace(/\/$/, '');
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

function buildUnsubscribeUrl(siteBaseUrl: string, email: string, token: string): string {
  return (
    `${siteBaseUrl}/api/subscribe/unsubscribe` +
    `?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
  );
}

function injectUnsubscribeFooter(html: string, unsubscribeUrl: string): string {
  if (html.includes('href="https://georgeelz.blog/unsubscribe"')) {
    return html.replace(
      /href="https:\/\/georgeelz\.blog\/unsubscribe"/g,
      `href="${unsubscribeUrl}"`,
    );
  }
  return html.replace(
    '</body>',
    `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px;font-size:11px;color:#999999;">` +
      `<a href="${unsubscribeUrl}" style="color:#111111;">Unsubscribe</a>` +
      `</td></tr></table></body>`,
  );
}

export const handler = async (
  event: NotifyPayload,
): Promise<{ sent: number; emails: string[] }> => {
  const { subject, body, html } = event;

  if (!subject || !body) {
    throw new Error('Payload must include "subject" and "body"');
  }

  const siteBaseUrl = getSiteBaseUrl();
  const from = getFromEmail();
  const subscribers = await getConfirmedSubscribers();

  if (subscribers.length === 0) {
    console.log('No confirmed subscribers found.');
    return { sent: 0, emails: [] };
  }

  console.log(`Sending to ${subscribers.length} confirmed subscriber(s)...`);

  const sent: string[] = [];

  for (const sub of subscribers) {
    const unsubscribeUrl = buildUnsubscribeUrl(siteBaseUrl, sub.email, sub.confirmationToken);
    const text = `${body}\n\nUnsubscribe: ${unsubscribeUrl}`;
    const htmlWithFooter = html ? injectUnsubscribeFooter(html, unsubscribeUrl) : undefined;

    await resend.emails.send({
      from,
      to: sub.email,
      subject,
      text,
      ...(htmlWithFooter ? { html: htmlWithFooter } : {}),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    sent.push(sub.email);
    console.log(`Sent to ${sub.email}`);
  }

  return { sent: sent.length, emails: sent };
};
