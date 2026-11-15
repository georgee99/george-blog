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
    const comments = await getComments(postSlug.trim());
    const publicComments = comments.map(({ commentId, author, content, createdAt, parentId, reactions }) => ({
      commentId,
      author,
      content,
      createdAt,
      ...(parentId ? { parentId } : {}),
      ...(reactions ? { reactions } : {}),
    }));
    return json(200, { comments: publicComments });
  } catch (err) {
    console.error('Failed to fetch comments:', err);
    return json(500, { error: 'Failed to fetch comments' });
  }
};
