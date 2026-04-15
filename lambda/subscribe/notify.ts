import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
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

function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  plain: string;
  html?: string;
  unsubscribeUrl: string;
}): string {
  const boundary = `boundary_${Date.now()}`;
  const lines: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `List-Unsubscribe: <${opts.unsubscribeUrl}>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.plain,
  ];

  if (opts.html) {
    lines.push(`--${boundary}`, `Content-Type: text/html; charset=UTF-8`, ``, opts.html);
  }

  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

export const handler = async (
  event: NotifyPayload,
): Promise<{ sent: number; emails: string[] }> => {
  const { subject, body, html } = event;

  if (!subject || !body) {
    throw new Error('Payload must include "subject" and "body"');
  }

  const siteBaseUrl = getSiteBaseUrl();
  const from = getSenderEmail();
  const subscribers = await getConfirmedSubscribers();

  if (subscribers.length === 0) {
    console.log('No confirmed subscribers found.');
    return { sent: 0, emails: [] };
  }

  console.log(`Sending to ${subscribers.length} confirmed subscriber(s)...`);

  const sent: string[] = [];

  for (const sub of subscribers) {
    const unsubscribeUrl = buildUnsubscribeUrl(siteBaseUrl, sub.email, sub.confirmationToken);
    const plain = `${body}\n\nUnsubscribe: ${unsubscribeUrl}`;
    const htmlWithFooter = html ? injectUnsubscribeFooter(html, unsubscribeUrl) : undefined;

    const rawEmail = buildRawEmail({
      from,
      to: sub.email,
      subject,
      plain,
      html: htmlWithFooter,
      unsubscribeUrl,
    });

    await ses.send(
      new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawEmail) },
      }),
    );
    sent.push(sub.email);
    console.log(`Sent to ${sub.email}`);
  }

  return { sent: sent.length, emails: sent };
};
