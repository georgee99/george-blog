import { createHash } from 'crypto'

export const EMBEDDING_MODEL = 'text-embedding-3-small'

export function embeddingContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
