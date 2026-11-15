import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHash, timingSafeEqual } from 'crypto';

export function json(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

// Checked in code as well as by API Gateway so a gateway misconfiguration cannot expose the data.
export function isAuthorised(event: APIGatewayProxyEvent): boolean {
  const expected = process.env.RAG_ANALYTICS_API_KEY;
  if (!expected) return false;

  const header = Object.entries(event.headers ?? {}).find(([k]) => k.toLowerCase() === 'x-api-key');
  const provided = header?.[1];
  if (!provided) return false;

  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
