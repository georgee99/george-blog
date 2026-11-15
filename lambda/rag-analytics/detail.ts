import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { isAuthorised, json } from './http';
import { getRecord } from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!isAuthorised(event)) return json(401, { error: 'Unauthorized' });

  const queryId = event.pathParameters?.queryId;
  if (!queryId || !UUID_RE.test(queryId)) return json(400, { error: 'Invalid queryId' });

  try {
    const record = await getRecord(queryId);
    return record ? json(200, record) : json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Failed to read analytics record:', err);
    return json(500, { error: 'Failed to read record' });
  }
};
