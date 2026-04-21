import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { addReaction, removeReaction } from './db';

const ALLOWED_REACTIONS = new Set(['👍', '👎', '❤️', '😢', '😡']);

function json(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { postSlug, commentId, emoji, action } = (parsed ?? {}) as Record<string, unknown>;

  if (!postSlug || typeof postSlug !== 'string' || postSlug.trim() === '') {
    return json(400, { error: 'postSlug is required' });
  }
  if (!commentId || typeof commentId !== 'string' || commentId.trim() === '') {
    return json(400, { error: 'commentId is required' });
  }
  if (!emoji || typeof emoji !== 'string' || !ALLOWED_REACTIONS.has(emoji)) {
    return json(400, { error: 'Invalid emoji' });
  }
  if (action !== undefined && action !== 'add' && action !== 'remove') {
    return json(400, { error: 'Invalid action' });
  }

  try {
    const reactions = action === 'remove'
      ? await removeReaction(postSlug.trim(), commentId.trim(), emoji)
      : await addReaction(postSlug.trim(), commentId.trim(), emoji);
    return json(200, { reactions });
  } catch (err) {
    console.error('Failed to update reaction:', err);
    return json(500, { error: 'Failed to update reaction' });
  }
};
