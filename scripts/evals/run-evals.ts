/**
 * run-evals.ts
 *
 * Phase 1 retrieval eval — no LLM calls, zero cost.
 *
 * For each test case it:
 *   1. Embeds the question via OpenAI
 *   2. Runs the same selectChunks() logic used in the API route
 *   3. Checks whether every expectedSlug appeared in the selected chunks
 *   4. Reports pass/fail per case and an overall recall score
 *
 * Usage:
 *   npx tsx scripts/evals/run-evals.ts
 *
 * Requires OPENAI_API_KEY in environment (or .env.local at project root).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '../../')

// Config (must match route.ts)
const EMBEDDING_MODEL = 'text-embedding-3-small'
const TOP_K = 5
const SIMILARITY_THRESHOLD = 0.30
const CONTEXT_TOKEN_CAP = 2500
const CHARS_PER_TOKEN = 4

const SYSTEM_PROMPT_TOKEN_ESTIMATE = 200 // conservative estimate

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

interface EvalCase {
  question: string
  expectedSlugs: string[]
  notes?: string
}

// Maths
function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0)
}
function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0))
}
function cosine(a: number[], b: number[]): number {
  return dot(a, b) / (norm(a) * norm(b) || 1e-8)
}
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// Retrieval (mirrors route.ts selectChunks)
function selectChunks(queryEmbedding: number[], chunks: Chunk[]): Chunk[] {
  const scored = chunks
    .map(c => ({ chunk: c, score: cosine(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)

  const seenSlugs = new Set<string>()
  const deduplicated = scored.filter(r => {
    if (r.score < SIMILARITY_THRESHOLD) return false
    if (seenSlugs.has(r.chunk.slug)) return false
    seenSlugs.add(r.chunk.slug)
    return true
  }).slice(0, TOP_K)

  const selected: Chunk[] = []
  let used = 0

  for (const { chunk, score } of deduplicated) {
    const chunkTokens = chunk.tokenEstimate ?? estimateTokens(chunk.text)
    if (selected.length > 0 && used + chunkTokens + SYSTEM_PROMPT_TOKEN_ESTIMATE > CONTEXT_TOKEN_CAP) break
    selected.push(chunk)
    used += chunkTokens
    void score
  }

  return selected
}

// Scoring
interface CaseResult {
  question: string
  expectedSlugs: string[]
  retrievedSlugs: string[]
  hit: boolean // all expected slugs retrieved
  partialHit: boolean // at least one expected slug retrieved
  notes?: string
}

function scoreCase(
  evalCase: EvalCase,
  retrieved: Chunk[],
): CaseResult {
  const retrievedSlugs = retrieved.map(c => c.slug)
  const hit = evalCase.expectedSlugs.every(s => retrievedSlugs.includes(s))
  const partialHit = evalCase.expectedSlugs.some(s => retrievedSlugs.includes(s))
  return {
    question: evalCase.question,
    expectedSlugs: evalCase.expectedSlugs,
    retrievedSlugs,
    hit,
    partialHit,
    notes: evalCase.notes,
  }
}

// Formatting
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

function fmt(result: CaseResult, index: number): string {
  const icon = result.hit ? `${GREEN}✓${RESET}` : result.partialHit ? `${YELLOW}~${RESET}` : `${RED}✗${RESET}`
  const label = result.hit ? 'PASS' : result.partialHit ? 'PARTIAL' : 'FAIL'
  const colour = result.hit ? GREEN : result.partialHit ? YELLOW : RED

  const lines = [
    `${icon} ${BOLD}[${index + 1}] ${result.question}${RESET}  ${colour}${label}${RESET}`,
    `   ${DIM}expected:  ${result.expectedSlugs.join(', ')}${RESET}`,
    `   ${DIM}retrieved: ${result.retrievedSlugs.length ? result.retrievedSlugs.join(', ') : '(none)'}${RESET}`,
  ]
  if (result.notes) lines.push(`   ${DIM}note: ${result.notes}${RESET}`)
  return lines.join('\n')
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    const envPath = path.join(ROOT, '.env.local')
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
      for (const line of lines) {
        const [k, ...rest] = line.split('=')
        if (k.trim() === 'OPENAI_API_KEY') {
          process.env.OPENAI_API_KEY = rest.join('=').trim()
          break
        }
      }
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not found in environment or .env.local')
    process.exit(1)
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Load embeddings store
  const storePath = path.join(ROOT, 'data/embeddings.json')
  if (!fs.existsSync(storePath)) {
    console.error('Error: data/embeddings.json not found. Run npm run build-embeddings first or check if exists.')
    process.exit(1)
  }
  const store = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as EmbeddingsStore
  console.log(`Loaded ${store.chunks.length} chunks from ${Object.keys(store.hashes).length} posts`)
  console.log(`Running ${BOLD}retrieval evals${RESET} (model: ${EMBEDDING_MODEL})\n`)

  // Load eval cases
  const casesPath = path.join(__dirname, 'eval-cases.json')
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8')) as EvalCase[]

  // Run each case
  const results: CaseResult[] = []

  for (const evalCase of cases) {
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: evalCase.question,
    })
    const queryEmbedding = res.data[0].embedding
    const retrieved = selectChunks(queryEmbedding, store.chunks)
    const caseScore = scoreCase(evalCase, retrieved)
    results.push(caseScore)
  }

  // Print results
  results.forEach((r, i) => console.log(fmt(r, i) + '\n'))

  // Summary
  const total = results.length
  const passed = results.filter(r => r.hit).length
  const partial = results.filter(r => !r.hit && r.partialHit).length
  const failed = results.filter(r => !r.partialHit).length
  const pct = Math.round((passed / total) * 100)

  console.log('─'.repeat(50))
  console.log(`${BOLD}Results: ${passed}/${total} full pass (${pct}%)${RESET}`)
  console.log(`  ${GREEN}✓ Pass:    ${passed}${RESET}`)
  console.log(`  ${YELLOW}~ Partial: ${partial}${RESET}  (at least one expected slug retrieved)`)
  console.log(`  ${RED}✗ Fail:    ${failed}${RESET}  (no expected slug retrieved)`)
  console.log()

  if (failed > 0) {
    console.log(`${RED}Failed cases:${RESET}`)
    results.filter(r => !r.partialHit).forEach(r =>
      console.log(`  • "${r.question}" — expected: ${r.expectedSlugs.join(', ')}`)
    )
    console.log()
  }

  process.exit(pct < 60 ? 1 : 0)  // exit 1 if below 60%
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
