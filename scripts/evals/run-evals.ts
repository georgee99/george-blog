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
import MiniSearch from 'minisearch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '../../')

// Config (must match route.ts)
const EMBEDDING_MODEL = 'text-embedding-3-small'
const TOP_K = 5
const CONTEXT_TOKEN_CAP = 2500
const CHARS_PER_TOKEN = 4

// Hybrid search config (must match route.ts)
const SEMANTIC_WEIGHT = 0.80
const KEYWORD_WEIGHT = 0.20

const SYSTEM_PROMPT_TOKEN_ESTIMATE = 200 // conservative estimate

// Types
interface Chunk {
  id: string
  slug: string
  title: string
  text: string
  embedding: number[]
  tokenEstimate: number
  heading?: string
  tags?: string[]
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

function extractQueryTags(question: string): Set<string> {
  const q = question.toLowerCase()
  const tags = new Set<string>()
  
  // Extract meaningful tag signals from query
  if (q.match(/\bchess\b/)) tags.add('chess')
  if (q.match(/\bcod(e|ing)\b|\bsoftware\b|\bprogramming\b|\bdev\b/)) tags.add('coding')
  if (q.match(/\bcoffee\b/)) tags.add('coffee')
  if (q.match(/\bfood\b|\bgelato\b|\bramen\b|\brestaurant\b/)) tags.add('food')
  if (q.match(/\bgames?\b|\bgaming\b/)) tags.add('games')
  if (q.match(/\bfilms?\b|\bfilms?\b|\bcinema\b/)) tags.add('film')
  if (q.match(/\bmusic\b|\balbums?\b|\bsongs?\b/)) tags.add('music')
  if (q.match(/\branking\b|\branked\b|\btier list\b/)) tags.add('ranking')
  if (q.match(/\breview\b|\bopinion\b/)) tags.add('review')
  if (q.match(/\btech\b|\btechnology\b/)) tags.add('tech')
  if (q.match(/\bwatchs?\b|\bwatches\b|\btimepiece\b/)) tags.add('watches')
  if (q.match(/\bwork\b|\bjob\b|\bcareer\b|\bcompany\b/)) tags.add('work')
  
  return tags
}

function buildKeywordIndex(chunks: Chunk[]): MiniSearch<Chunk> {
  const index = new MiniSearch<Chunk>({
    fields: ['text', 'title', 'heading'], // Fields to index
    storeFields: ['id', 'slug', 'title', 'text', 'tokenEstimate', 'heading', 'tags'], // Fields to store
    searchOptions: {
      boost: { title: 3, heading: 2, text: 1 }, // Boost title and heading
      fuzzy: 0.2, // Allow some typos
    },
  })

  index.addAll(chunks)
  return index
}

// Retrieval (mirrors route.ts selectChunks with hybrid search)
function selectChunks(query: string, queryEmbedding: number[], chunks: Chunk[]): Chunk[] {
  const queryTags = extractQueryTags(query)

  // Semantic search part
  const semanticScored = chunks.map(c => {
    const baseScore = cosine(queryEmbedding, c.embedding)
    const chunkTags = new Set(c.tags ?? [])

    let adjustedScore = baseScore
    
    // Boost if chunk has any query-relevant tags
    if (queryTags.size > 0 && chunkTags.size > 0) {
      const hasMatch = Array.from(queryTags).some(tag => chunkTags.has(tag))
      if (hasMatch) {
        adjustedScore += 0.10
      } else {
        // Penalize conflicting media types
        const mediaTypes = new Set(['film', 'games', 'music'])
        const queryMedia = Array.from(queryTags).filter(t => mediaTypes.has(t))
        const chunkMedia = Array.from(chunkTags).filter(t => mediaTypes.has(t))
        
        if (queryMedia.length > 0 && chunkMedia.length > 0) {
          const hasConflict = !queryMedia.some(t => chunkMedia.includes(t))
          if (hasConflict) adjustedScore -= 0.15
        }
      }
    }

    return { chunk: c, score: adjustedScore, source: 'semantic' as const }
  })

  // Keyword search part
  const index = buildKeywordIndex(chunks)
  const keywordResults = index.search(query, { 
    boost: { title: 3, heading: 2, text: 1 },
    fuzzy: 0.2,
  })
  
  // Map keyword results to chunk objects with scores
  const keywordScored = keywordResults.map(result => {
    const chunk = chunks.find(c => c.id === result.id)!
    return { chunk, score: result.score, source: 'keyword' as const }
  })

  // Normalisation
  const semanticScores = semanticScored.map(r => r.score)
  const semanticMin = Math.min(...semanticScores)
  const semanticMax = Math.max(...semanticScores)
  const semanticRange = semanticMax - semanticMin || 1

  const normalizedSemantic = semanticScored.map(r => ({
    ...r,
    normalizedScore: (r.score - semanticMin) / semanticRange
  }))

  // Normalize keyword scores
  const keywordScores = keywordScored.map(r => r.score)
  const keywordMin = keywordScores.length > 0 ? Math.min(...keywordScores) : 0
  const keywordMax = keywordScores.length > 0 ? Math.max(...keywordScores) : 1
  const keywordRange = keywordMax - keywordMin || 1

  const normalizedKeyword = keywordScored.map(r => ({
    ...r,
    normalizedScore: (r.score - keywordMin) / keywordRange
  }))

  // HYBRID MERGE: Combine both result sets, merging duplicates with weighted scores
  const hybridMap = new Map<string, { chunk: Chunk; hybridScore: number; sources: string[] }>()

  // Add semantic results
  normalizedSemantic.forEach(({ chunk, normalizedScore }) => {
    const existing = hybridMap.get(chunk.id)
    if (existing) {
      existing.hybridScore += SEMANTIC_WEIGHT * normalizedScore
      existing.sources.push('semantic')
    } else {
      hybridMap.set(chunk.id, {
        chunk,
        hybridScore: SEMANTIC_WEIGHT * normalizedScore,
        sources: ['semantic']
      })
    }
  })

  // Add keyword results
  normalizedKeyword.forEach(({ chunk, normalizedScore }) => {
    const existing = hybridMap.get(chunk.id)
    if (existing) {
      existing.hybridScore += KEYWORD_WEIGHT * normalizedScore
      existing.sources.push('keyword')
    } else {
      hybridMap.set(chunk.id, {
        chunk,
        hybridScore: KEYWORD_WEIGHT * normalizedScore,
        sources: ['keyword']
      })
    }
  })

  // Convert to array and sort by hybrid score
  const hybridScored = Array.from(hybridMap.values())
    .map(({ chunk, hybridScore, sources }) => ({
      chunk,
      score: hybridScore,
      sources: sources.join('+')
    }))
    .sort((a, b) => b.score - a.score)

  // Deduplication and filtering
  const seenSlugs = new Set<string>()
  const deduplicated = hybridScored.filter(r => {
    if (r.score < 0.1) return false
    if (seenSlugs.has(r.chunk.slug)) return false
    seenSlugs.add(r.chunk.slug)
    return true
  }).slice(0, TOP_K)

  // Token-budget selection
  const selected: Chunk[] = []
  let used = 0

  for (const { chunk } of deduplicated) {
    const chunkTokens = chunk.tokenEstimate ?? estimateTokens(chunk.text)
    if (selected.length > 0 && used + chunkTokens + SYSTEM_PROMPT_TOKEN_ESTIMATE > CONTEXT_TOKEN_CAP) break
    selected.push(chunk)
    used += chunkTokens
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
  isSmokeTest: boolean // no expected slugs (testing edge cases)
  notes?: string
}

function scoreCase(
  evalCase: EvalCase,
  retrieved: Chunk[],
): CaseResult {
  const retrievedSlugs = retrieved.map(c => c.slug)
  const isSmokeTest = evalCase.expectedSlugs.length === 0
  const hit = !isSmokeTest && evalCase.expectedSlugs.every(s => retrievedSlugs.includes(s))
  const partialHit = !isSmokeTest && evalCase.expectedSlugs.some(s => retrievedSlugs.includes(s))
  return {
    question: evalCase.question,
    expectedSlugs: evalCase.expectedSlugs,
    retrievedSlugs,
    hit,
    partialHit,
    isSmokeTest,
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
  if (result.isSmokeTest) {
    const icon = `${DIM}○${RESET}`
    const label = 'SMOKE TEST'
    const lines = [
      `${icon} ${BOLD}[${index + 1}] ${result.question || '(empty query)'}${RESET}  ${DIM}${label}${RESET}`,
      `   ${DIM}retrieved: ${result.retrievedSlugs.length ? result.retrievedSlugs.join(', ') : '(none)'}${RESET}`,
    ]
    if (result.notes) lines.push(`   ${DIM}note: ${result.notes}${RESET}`)
    return lines.join('\n')
  }

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
    const retrieved = selectChunks(evalCase.question, queryEmbedding, store.chunks)
    const caseScore = scoreCase(evalCase, retrieved)
    results.push(caseScore)
  }

  // Print results
  results.forEach((r, i) => console.log(fmt(r, i) + '\n'))

  // Summary
  const smokeTests = results.filter(r => r.isSmokeTest)
  const realTests = results.filter(r => !r.isSmokeTest)
  const total = realTests.length
  const passed = realTests.filter(r => r.hit).length
  const partial = realTests.filter(r => !r.hit && r.partialHit).length
  const failed = realTests.filter(r => !r.hit && !r.partialHit).length
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0

  console.log('─'.repeat(50))
  console.log(`${BOLD}Results: ${passed}/${total} full pass (${pct}%)${RESET}`)
  console.log(`  ${GREEN}✓ Pass:    ${passed}${RESET}`)
  console.log(`  ${YELLOW}~ Partial: ${partial}${RESET}  (at least one expected slug retrieved)`)
  console.log(`  ${RED}✗ Fail:    ${failed}${RESET}  (no expected slug retrieved)`)
  if (smokeTests.length > 0) {
    console.log(`  ${DIM}○ Smoke:   ${smokeTests.length}${RESET}  (edge case tests, no assertions)`)
  }
  console.log()

  if (failed > 0) {
    console.log(`${RED}Failed cases:${RESET}`)
    realTests.filter(r => !r.hit && !r.partialHit).forEach(r =>
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
