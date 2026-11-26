import { createHmac, timingSafeEqual } from 'crypto'

export function feedbackToken(queryId: string, timestamp: string, key: string): string {
  return createHmac('sha256', key).update(`rag-feedback:${queryId}:${timestamp}`).digest('hex')
}

export function validFeedbackToken(queryId: string, timestamp: string, token: string, key: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(token)) return false
  const expected = Buffer.from(feedbackToken(queryId, timestamp, key), 'hex')
  return timingSafeEqual(expected, Buffer.from(token, 'hex'))
}
