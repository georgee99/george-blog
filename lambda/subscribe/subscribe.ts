import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { getSubscriber, putSubscriber, Subscriber } from './db';
import { sendConfirmationEmail } from './email';

function json(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { email: rawEmail, source } = (parsed ?? {}) as Record<string, unknown>;

  if (!rawEmail || typeof rawEmail !== 'string') {
    return json(400, { error: 'email is required' });
  }

  const email = rawEmail.trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    return json(400, { error: 'Invalid email address' });
  }

  const existing = await getSubscriber(email);

  if (existing?.status === 'confirmed') {
    return json(200, { message: 'already subscribed' });
  }

  const confirmationToken = randomUUID();
  const now = new Date().toISOString();

  if (existing?.status === 'pending') {
    // Refresh token and resend
    const updated: Subscriber = {
      ...existing,
      confirmationToken,
    };
    await putSubscriber(updated);
  } else {
    // New subscriber
    const subscriber: Subscriber = {
      email,
      status: 'pending',
      confirmationToken,
      createdAt: now,
      confirmedAt: null,
      source: typeof source === 'string' ? source.trim() : null,
    };
    await putSubscriber(subscriber);
  }

  try {
    await sendConfirmationEmail(email, confirmationToken);
  } catch (err) {
    console.error('Failed to send confirmation email:', err);
    return json(500, { error: 'Failed to send confirmation email' });
  }

  return json(200, { message: 'Check your email to confirm your subscription.' });
};
