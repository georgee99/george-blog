import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateCommentInput } from './validate';
import { insertComment } from './db';
import { publishCommentCreated } from './sns';

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

  // Validation
  const validation = validateCommentInput(parsed);
  if (!validation.valid) {
    return json(400, { error: validation.error });
  }

  const { postSlug, authorName, body } = parsed as {
    postSlug: string;
    authorName: string;
    body: string;
  };

  // Insert into PostgreSQL
  let comment;
  try {
    comment = await insertComment(postSlug, authorName, body);
  } catch (err) {
    console.error('DB insert failed:', err);
    return json(500, { error: 'Failed to save comment' });
  }

  // Publish to SNS — failure is non-fatal
  try {
    await publishCommentCreated(postSlug, authorName, comment.created_at);
  } catch (err) {
    console.error('SNS publish failed (non-fatal):', err);
  }

  // Return created comment ID
  return json(201, { id: comment.id });
};
