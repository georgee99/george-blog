import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHmac, timingSafeEqual } from 'crypto';
import { setSubscriberStatus } from './db';

// resend uses Svix for webhook delivery
function verifyWebhookSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): boolean {
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const computed = `v1,${createHmac('sha256', secretBytes).update(signedContent).digest('base64')}`;
  // svix-signature may contain multiple space-separated signatures
  return svixSignature.split(' ').some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
    } catch {
      return false;
    }
  });
}

interface ResendWebhookEvent {
  type: string;
  data: {
    to: string[];
    [key: string]: unknown;
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error('RESEND_WEBHOOK_SECRET environment variable is not set');

  const svixId = event.headers['svix-id'] ?? '';
  const svixTimestamp = event.headers['svix-timestamp'] ?? '';
  const svixSignature = event.headers['svix-signature'] ?? '';
  const body = event.body ?? '';

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing webhook headers' }) };
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const ts = parseInt(svixTimestamp, 10);
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Timestamp too old' }) };
  }

  if (!verifyWebhookSignature(body, svixId, svixTimestamp, svixSignature, secret)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let payload: ResendWebhookEvent;
  try {
    payload = JSON.parse(body) as ResendWebhookEvent;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { type, data } = payload;

  if (type === 'email.bounced') {
    for (const email of data.to ?? []) {
      console.log(`Marking ${email} as bounced`);
      await setSubscriberStatus(email, 'bounced');
    }
  } else if (type === 'email.complained') {
    for (const email of data.to ?? []) {
      console.log(`Marking ${email} as complained`);
      await setSubscriberStatus(email, 'complained');
    }
  } else {
    console.log('Unhandled Resend webhook event type:', type);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
