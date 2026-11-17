import 'server-only'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { EMBEDDING_MODEL, embeddingContentHash } from '@/lib/embedding-hash'

export interface CoverageRow {
  slug: string
  title: string
  status: 'current' | 'missing' | 'stale' | 'orphaned'
  chunks: number
}

export function getRagCoverage(): { model: string; builtAt: string; modelMismatch: boolean; rows: CoverageRow[] } {
  const postsDir = path.join(process.cwd(), 'content', 'posts')
  const storePath = path.join(process.cwd(), 'data', 'embeddings.json')
  const parsed: unknown = JSON.parse(fs.readFileSync(storePath, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid embeddings store')
  const store = parsed as Record<string, unknown>
  if (typeof store.model !== 'string' || typeof store.builtAt !== 'string' ||
      !store.hashes || typeof store.hashes !== 'object' || Array.isArray(store.hashes) ||
      !Array.isArray(store.chunks)) throw new Error('Invalid embeddings store')

  const hashes = store.hashes as Record<string, unknown>
  const chunkCounts = new Map<string, number>()
  for (const chunk of store.chunks) {
    if (!chunk || typeof chunk !== 'object' || typeof chunk.slug !== 'string') {
      throw new Error('Invalid embedding chunk')
    }
    chunkCounts.set(chunk.slug, (chunkCounts.get(chunk.slug) ?? 0) + 1)
  }
  const rows: CoverageRow[] = []
  const published = new Set<string>()
  for (const file of fs.readdirSync(postsDir).filter((name) => name.endsWith('.mdx'))) {
    const slug = file.slice(0, -4)
    const raw = fs.readFileSync(path.join(postsDir, file), 'utf8')
    const { data } = matter(raw)
    if (data.published === false) continue
    published.add(slug)
    const chunks = chunkCounts.get(slug) ?? 0
    const hash = hashes[slug]
    rows.push({
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      chunks,
      status: typeof hash !== 'string' || !chunks ? 'missing'
        : hash !== embeddingContentHash(raw) || store.model !== EMBEDDING_MODEL ? 'stale' : 'current',
    })
  }
  for (const slug of new Set([...Object.keys(hashes), ...chunkCounts.keys()])) {
    if (!published.has(slug)) {
      rows.push({ slug, title: slug, status: 'orphaned', chunks: chunkCounts.get(slug) ?? 0 })
    }
  }
  rows.sort((a, b) => a.title.localeCompare(b.title))
  return { model: store.model, builtAt: store.builtAt, modelMismatch: store.model !== EMBEDDING_MODEL, rows }
}
