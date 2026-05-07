/**
 * build-embeddings.ts
 *
 * Reads every published MDX post, chunks the content, generates embeddings
 * via OpenAI, and writes the result to data/embeddings.json.
 *
 * Incremental: only re-embeds posts whose content hash has changed.
 *
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Config
const POSTS_DIR = path.join(__dirname, '../../content/posts')
const OUTPUT_PATH = path.join(__dirname, '../../data/embeddings.json')
const EMBEDDING_MODEL = 'text-embedding-3-small' // cheapest / fastest OpenAI model
const CHUNK_TOKENS = 500  
const CHUNK_OVERLAP = 75  
const CHARS_PER_TOKEN = 4

// Types
interface Chunk {
  id: string
  slug: string
  title: string
  text: string
  embedding: number[]
  tokenEstimate: number
}

interface EmbeddingsStore {
  model: string
  builtAt: string
  hashes: Record<string, string>
  chunks: Chunk[]
}

// Helpers

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Split text into overlapping chunks targeting ~CHUNK_TOKENS tokens each.
 * Splits on paragraph boundaries first, then falls back to word boundaries.
 */
function chunkText(text: string): string[] {
  const maxChars = CHUNK_TOKENS * CHARS_PER_TOKEN
  const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN

  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChars && current.length > 0) {
      chunks.push(current.trim())
      // carry overlap from end of current chunk
      const overlapText = current.slice(-overlapChars)
      current = overlapText + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

/** Strip MDX/markdown syntax for cleaner embeddings */
function stripMarkdown(mdx: string): string {
  return mdx
    .replace(/\r\n/g, '\n')             // normalize Windows line endings
    .replace(/^---[\s\S]*?---\n?/, '')  // frontmatter
    .replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, '') // JSX self-closing components e.g. <SpidermanToggle />
    .replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, '') // JSX block components
    .replace(/```[\s\S]*?```/g, '')      // code blocks
    .replace(/`[^`]*`/g, '')             // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')     // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/#{1,6}\s+/g, '')           // headings
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // bold/italic
    .replace(/^\s*[-*+]\s+/gm, '')       // list bullets
    .replace(/^\s*\d+\.\s+/gm, '')       // ordered lists
    .replace(/\n{3,}/g, '\n\n')          // excess blank lines
    .trim()
}

async function embedBatch(client: OpenAI, texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return res.data.map((d: { embedding: number[] }) => d.embedding)
}

// Main
async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is not set.')
    process.exit(1)
  }

  const client = new OpenAI({ apiKey })

  // Load existing store (for incremental updates)
  let store: EmbeddingsStore = {
    model: EMBEDDING_MODEL,
    builtAt: new Date().toISOString(),
    hashes: {},
    chunks: [],
  }
  if (fs.existsSync(OUTPUT_PATH)) {
    store = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')) as EmbeddingsStore
    console.log(`Loaded existing store: ${store.chunks.length} chunks from ${Object.keys(store.hashes).length} posts`)
  }

  // If embedding model changed, force full rebuild
  if (store.model !== EMBEDDING_MODEL) {
    console.log(`Embedding model changed (${store.model} → ${EMBEDDING_MODEL}). Full rebuild.`)
    store.hashes = {}
    store.chunks = []
  }

  // Read all published posts
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.mdx'))
  const toRebuild: { slug: string; raw: string; title: string }[] = []
  const currentSlugs = new Set<string>()

  for (const file of files) {
    const slug = file.replace(/\.mdx$/, '')
    const filePath = path.join(POSTS_DIR, file)
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { data } = matter(raw)

    if (data.published === false) continue  // skip unpublished
    currentSlugs.add(slug)

    const hash = sha256(raw)
    if (store.hashes[slug] === hash) {
      console.log(`  skip  ${slug} (unchanged)`)
      continue
    }

    console.log(`  queue ${slug} (new or changed)`)
    toRebuild.push({ slug, raw, title: data.title ?? slug })
  }

  // Remove chunks for deleted/unpublished posts
  const removedSlugs = Object.keys(store.hashes).filter(s => !currentSlugs.has(s))
  if (removedSlugs.length > 0) {
    console.log(`Removing chunks for: ${removedSlugs.join(', ')}`)
    store.chunks = store.chunks.filter(c => !removedSlugs.includes(c.slug))
    for (const s of removedSlugs) delete store.hashes[s]
  }

  if (toRebuild.length === 0) {
    console.log('Nothing to update.')
  } else {
    for (const { slug, raw, title } of toRebuild) {
      const { content } = matter(raw)
      const clean = stripMarkdown(content)
      const textChunks = chunkText(clean)

      console.log(`  embed ${slug} → ${textChunks.length} chunk(s)`)

      // Remove old chunks for this slug
      store.chunks = store.chunks.filter(c => c.slug !== slug)

      // Embed in one batch per post (small posts are usually 1–3 chunks)
      const embeddings = await embedBatch(client, textChunks)

      textChunks.forEach((text, i) => {
        store.chunks.push({
          id: `${slug}::${i}`,
          slug,
          title,
          text,
          embedding: embeddings[i],
          tokenEstimate: estimateTokens(text),
        })
      })

      store.hashes[slug] = sha256(raw)
    }
  }

  // Write output
  store.model = EMBEDDING_MODEL
  store.builtAt = new Date().toISOString()

  const dataDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(store, null, 2), 'utf-8')

  console.log(`\nDone. ${store.chunks.length} total chunks → ${OUTPUT_PATH}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
