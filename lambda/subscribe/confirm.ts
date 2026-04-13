import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getSubscriber, confirmSubscriber } from './db';

function json(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const email = event.queryStringParameters?.email?.trim().toLowerCase();
  const token = event.queryStringParameters?.token?.trim();

  if (!email || !token) {
    return json(400, { error: 'email and token are required' });
  }

  const subscriber = await getSubscriber(email);

  if (!subscriber) {
    return json(400, { error: 'Invalid confirmation link' });
  }

  if (subscriber.status === 'confirmed') {
    return json(200, { message: 'Already confirmed' });
  }

  if (subscriber.confirmationToken !== token) {
    return json(400, { error: 'Invalid confirmation link' });
  }

  await confirmSubscriber(email, new Date().toISOString());

  return json(200, { message: 'Subscription confirmed!' });
};
