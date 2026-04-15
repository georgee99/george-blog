import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getSubscriber, setSubscriberStatus } from './db';

function getSiteBaseUrl(): string {
  const url = process.env.SITE_BASE_URL;
  if (!url) throw new Error('SITE_BASE_URL environment variable is not set');
  return url.replace(/\/$/, '');
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const email = event.queryStringParameters?.email;
  const token = event.queryStringParameters?.token;

  if (!email || !token) {
    return redirect(`${getSiteBaseUrl()}/?unsubscribe=invalid`);
  }

  const subscriber = await getSubscriber(email);

  if (!subscriber) {
    return redirect(`${getSiteBaseUrl()}/?unsubscribe=notfound`);
  }

  if (subscriber.confirmationToken !== token) {
    return redirect(`${getSiteBaseUrl()}/?unsubscribe=invalid`);
  }

  if (subscriber.status === 'unsubscribed') {
    return redirect(`${getSiteBaseUrl()}/?unsubscribe=already`);
  }

  await setSubscriberStatus(email, 'unsubscribed');
  console.log(`Unsubscribed: ${email}`);

  return redirect(`${getSiteBaseUrl()}/?unsubscribe=success`);
};

function redirect(url: string): APIGatewayProxyResult {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: '',
  };
}
