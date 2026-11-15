import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { isAuthorised, json } from './http';
import { putRecord } from './db';
import { parseRecord } from './validate';

const MAX_BODY_BYTES = 32 * 1024;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!isAuthorised(event)) return json(401, { error: 'Unauthorized' });

  const raw = event.body ?? '';
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: 'Payload too large' });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const record = parseRecord(parsed);
  if (!record) return json(400, { error: 'Invalid analytics record' });

  try {
    const outcome = await putRecord(record);
    return json(outcome === 'created' ? 201 : 200, { queryId: record.queryId });
  } catch (err) {
    console.error('Failed to persist analytics record:', err);
    return json(500, { error: 'Failed to save record' });
  }
};
