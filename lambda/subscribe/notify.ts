import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Resend } from 'resend';
import { Subscriber } from './db';
import { beginRun, updateRun } from './history';

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
  campaignId?: string;
  postSlug?: string;
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
  const { subject, body, html, campaignId, postSlug } = event;

  if (!subject || !body) {
    throw new Error('Payload must include "subject" and "body"');
  }
  if ((campaignId !== undefined && (typeof campaignId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(campaignId))) ||
      (postSlug !== undefined && (typeof postSlug !== 'string' || postSlug.length > 200))) {
    throw new Error('Invalid campaignId or postSlug');
  }

  const siteBaseUrl = getSiteBaseUrl();
  const from = getFromEmail();
  const runId = await beginRun(subject, campaignId, postSlug);
  const state: { status: 'in_progress' | 'completed' | 'failed'; total: number | null; attempted: number; accepted: number } =
    { status: 'in_progress', total: null, attempted: 0, accepted: 0 };
  const sent: string[] = [];
  try {
    const subscribers = await getConfirmedSubscribers();
    state.total = subscribers.length;
    await updateRun(runId, state);

    if (subscribers.length === 0) {
      console.log('No confirmed subscribers found.');
      state.status = 'completed';
      await updateRun(runId, state);
      return { sent: 0, emails: [] };
    }

    console.log(`Sending to ${subscribers.length} confirmed subscriber(s)...`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);

      const emails = batch.map((sub) => {
        const unsubscribeUrl = buildUnsubscribeUrl(siteBaseUrl, sub.email, sub.confirmationToken);
        const text = `${body}\n\nUnsubscribe: ${unsubscribeUrl}`;
        const htmlWithFooter = html ? injectUnsubscribeFooter(html, unsubscribeUrl) : undefined;

        return {
          from,
          to: sub.email,
          subject,
          text,
          ...(htmlWithFooter ? { html: htmlWithFooter } : {}),
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });

      state.attempted += batch.length;
      await updateRun(runId, state);
      const result = await resend.batch.send(emails);
      if (result.error) {
        console.error('Resend batch failed:', result.error.name);
        throw new Error('Resend batch outcome is uncertain; review before retrying');
      }
      if (result.data.data.length <= batch.length) state.accepted += result.data.data.length;
      await updateRun(runId, state);
      if (result.data.data.length !== batch.length) {
        throw new Error('Resend batch outcome is uncertain; review before retrying');
      }
      batch.forEach((sub) => {
        sent.push(sub.email);
      });
    }

    state.status = 'completed';
    await updateRun(runId, state);
    return { sent: sent.length, emails: sent };
  } catch (error) {
    state.status = 'failed';
    try {
      await updateRun(runId, state);
    } catch (historyError) {
      console.error('Failed to update newsletter history:', historyError);
    }
    throw error;
  }
};
