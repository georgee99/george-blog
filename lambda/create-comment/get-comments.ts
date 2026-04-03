import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getComments } from './db';

function json(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const postSlug = event.queryStringParameters?.postSlug;

  if (!postSlug || typeof postSlug !== 'string' || postSlug.trim() === '') {
    return json(400, { error: 'postSlug query parameter is required' });
  }

  try {
    const comments = await getComments(postSlug.trim(), 10);
    return json(200, { comments });
  } catch (err) {
    console.error('Failed to fetch comments:', err);
    return json(500, { error: 'Failed to fetch comments' });
  }
};
