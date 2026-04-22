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

  const { postSlug, authorName, body, parentId, ipHash, userAgent, clientId } = parsed as {
    postSlug: string;
    authorName: string;
    body: string;
    parentId?: string;
    ipHash?: string;
    userAgent?: string;
    clientId?: string;
  };

  // Insert into DynamoDB
  let comment;
  try {
    comment = await insertComment(postSlug, authorName, body, parentId, ipHash, userAgent, clientId);
    console.log(`Comment created with ID ${comment.commentId} for post ${postSlug}`);
  } catch (err) {
    console.error('DB insert failed:', err);
    return json(500, { error: 'Failed to save comment' });
  }

  // Publish to SNS — failure is non-fatal, timeout after 6s so it never blocks the response
  try {
    await Promise.race([
      publishCommentCreated(postSlug, authorName, comment.createdAt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SNS timeout')), 6000)),
    ]);
  } catch (err) {
    console.error('SNS publish failed (non-fatal):', err);
  }

  // Return created comment ID
  return json(201, { id: comment.commentId });
};
