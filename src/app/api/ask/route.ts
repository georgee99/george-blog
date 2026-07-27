import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import MiniSearch from 'minisearch'

// Config
const EMBEDDING_MODEL = 'text-embedding-3-small'
const CHAT_MODEL = 'gpt-4o-mini'
const TOP_K = 5
const CONTEXT_TOKEN_CAP = 2500
const RESPONSE_MAX_TOKENS = 250
const TEMPERATURE = 0.3
const CHARS_PER_TOKEN = 4
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

// Hybrid search config
const SEMANTIC_WEIGHT = 0.80
const KEYWORD_WEIGHT = 0.20

// Re-ranking config
const ENABLE_RERANK = process.env.ENABLE_RERANK === 'true' || true
const RERANK_MODEL = 'gpt-4o-mini'
const RERANK_CANDIDATES = 15 // Retrieve more candidates for re-ranking
const RERANK_MAX_TOKENS = 300 // Limit output tokens for re-ranking

// In-memory keyword index cache
let keywordIndex: MiniSearch<Chunk> | null = null
let lastEmbeddingsModified: number = 0

const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) return true
  return false
}

function sanitizeQuestion(input: string): string {
  return input
    // Strip control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim()
}

async function rewriteQuery(
  original: string,
  client: OpenAI
): Promise<{ rewritten: string; tags: string[] }> {
  try {
    const prompt = `Rewrite the user's query for semantic retrieval over a personal technical blog.

Goals:
- Preserve the user's original meaning and intent.
- Produce a concise, standalone search query.
- Expand abbreviations only when their meaning is clear.
- Replace vague wording with explicit concepts only when supported by the query.
- Add useful synonyms when they improve recall.
- Do not invent names, products, technologies, opinions, or intentions.
- Do not turn informational queries into recommendation queries unless the user asks for recommendations.
- Resolve pronouns only when their subject is clear. Otherwise, preserve the ambiguity.

Tags:
- Select zero or more tags from this list only:
  ["chess", "coding", "coffee", "food", "games", "me", "movie", "music", "ranking", "review", "tech", "watches", "work"]
- Include a tag only when strongly supported by the query.
- Return an empty array when no tag clearly applies.

Return only one valid JSON object in this exact shape:
{
  "rewritten": "string",
  "tags": ["string"]
}

Examples:
- "best camera" → {"rewritten":"best camera","tags":["tech"]}
- "how does RAG work?" → {"rewritten":"retrieval augmented generation architecture and how it works","tags":["coding","tech"]}
- "what does he think about coffee?" → {"rewritten":"opinions about coffee","tags":["coffee"]}
- "episodes ranked" → {"rewritten":"episodes ranked","tags":["ranking"]}
- "chess openings" → {"rewritten":"chess openings strategies","tags":["chess"]}

User query:
<query>
${original}
</query>`

    const resp = await client.chat.completions.create({
      model: RERANK_MODEL, // Reuse the same model for consistency
      temperature: 0,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content: 'You are a query rewriter. Output only valid JSON. Never add explanations.',
        },
        { role: 'user', content: prompt },
      ],
    })

    const content = resp.choices?.[0]?.message?.content?.trim() ?? ''

    // Extract first JSON object if model adds surrounding text
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ask] rewriteQuery: no JSON found in response')
      }
      return { rewritten: original, tags: [] }
    }

    const parsed = JSON.parse(match[0]) as { rewritten?: string; tags?: string[] }

    const rewritten =
      typeof parsed.rewritten === 'string' && parsed.rewritten.length > 0
        ? parsed.rewritten
        : original

    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === 'string' && t.length > 0)
      : []

    if (process.env.NODE_ENV === 'development') {
      console.log(`[ask] rewriteQuery: "${original}" → "${rewritten}"`, tags)
    }

    return { rewritten, tags }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ask] rewriteQuery failed:', error)
    }
    return { rewritten: original, tags: [] }
  }
}

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
  if (q.match(/\bmovies?\b|\bfilms?\b|\bcinema\b/)) tags.add('movie')
  if (q.match(/\bmusic\b|\balbums?\b|\bsongs?\b/)) tags.add('music')
  if (q.match(/\branking\b|\branked\b|\btier list\b/)) tags.add('ranking')
  if (q.match(/\breview\b|\bopinion\b/)) tags.add('review')
  if (q.match(/\btech\b|\btechnology\b/)) tags.add('tech')
  if (q.match(/\bwatchs?\b|\bwatches\b|\btimepiece\b/)) tags.add('watches')
  if (q.match(/\bwork\b|\bjob\b|\bcareer\b|\bcompany\b/)) tags.add('work')
  
  return tags
}

function loadStore(): EmbeddingsStore | null {
  const storePath = path.join(process.cwd(), 'data/embeddings.json')
  if (!fs.existsSync(storePath)) return null
  return JSON.parse(fs.readFileSync(storePath, 'utf-8')) as EmbeddingsStore
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

function ensureKeywordIndex(chunks: Chunk[]): MiniSearch<Chunk> {
  const storePath = path.join(process.cwd(), 'data/embeddings.json')
  const currentModified = fs.existsSync(storePath) ? fs.statSync(storePath).mtimeMs : 0

  if (!keywordIndex || currentModified !== lastEmbeddingsModified) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ask] Building/rebuilding keyword index...')
    }
    keywordIndex = buildKeywordIndex(chunks)
    lastEmbeddingsModified = currentModified
  }

  return keywordIndex
}

async function rerankChunks(
  query: string,
  candidates: Chunk[],
  client: OpenAI
): Promise<Chunk[]> {
  if (candidates.length === 0) return []

  // Create compact representations of chunks for re-ranking
  const chunkDescriptions = candidates.map((c, idx) => {
    const preview = c.text.slice(0, 150).replace(/\n/g, ' ')
    return `[${idx}] Title: ${c.title}${c.heading ? ` | Section: ${c.heading}` : ''}\nPreview: ${preview}...`
  }).join('\n\n')

  const rerankPrompt = `You are a relevance ranking system. Given a user query and a list of blog post chunks, rank them by how well they answer the query.

User Query: "${query}"

Chunks:
${chunkDescriptions}

Rank these chunks from most to least relevant for answering the query. Return ONLY a JSON array of chunk indices in ranked order, like: [2, 0, 5, 1, 3, 4]

Ranked indices:`

  try {
    const response = await client.chat.completions.create({
      model: RERANK_MODEL,
      temperature: 0,
      max_tokens: RERANK_MAX_TOKENS,
      messages: [
        { role: 'system', content: 'You are a precise ranking system. Return only valid JSON arrays of integers.' },
        { role: 'user', content: rerankPrompt }
      ]
    })

    const content = response.choices[0]?.message?.content?.trim() ?? ''
    
    // Extract JSON array from response
    const match = content.match(/\[(\d+(?:,\s*\d+)*)\]/)
    if (!match) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ask] Re-ranking failed: invalid response format, falling back to original order')
      }
      return candidates
    }

    const rankedIndices = JSON.parse(match[0]) as number[]
    
    // Validate indices
    const validIndices = rankedIndices.filter(idx => idx >= 0 && idx < candidates.length)
    if (validIndices.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ask] Re-ranking failed: no valid indices, falling back to original order')
      }
      return candidates
    }

    // Reorder chunks based on ranking
    const reranked = validIndices.map(idx => candidates[idx])
    
    // Add any chunks that weren't ranked (shouldn't happen, but defensive)
    const rankedSet = new Set(validIndices)
    const unranked = candidates.filter((_, idx) => !rankedSet.has(idx))
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[ask] Re-ranked order:', reranked.map(c => c.slug).slice(0, 5).join(', '))
    }

    return [...reranked, ...unranked]
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ask] Re-ranking error:', error)
    }
    return candidates // Fallback to original order on error
  }
}

async function selectChunks(
  query: string,
  queryEmbedding: number[],
  chunks: Chunk[],
  client: OpenAI,
  extractedTags: string[] = []
): Promise<Chunk[]> {
  // Merge LLM-extracted tags with regex-extracted tags
  const regexTags = extractQueryTags(query)
  const queryTags = new Set<string>([...extractedTags, ...Array.from(regexTags)])

  // Semantic/vector search 
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
        const mediaTypes = new Set(['movie', 'games', 'music'])
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

  // === KEYWORD SEARCH ===
  const index = ensureKeywordIndex(chunks)
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

  // Normalize keyword scores (variable range from BM25)
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

  if (process.env.NODE_ENV === 'development') {
    console.log('[ask] hybrid top scores:',
      hybridScored.slice(0, 5).map(r => `${r.chunk.slug} (${r.score.toFixed(4)}, ${r.sources})`).join(', ')
    )
  }

  // Deduplication and filtering
  const seenSlugs = new Set<string>()
  const candidateCount = ENABLE_RERANK ? RERANK_CANDIDATES : TOP_K
  const deduplicated = hybridScored.filter(r => {
    // For hybrid, apply a lower threshold since scores are normalized differently
    if (r.score < 0.1) return false
    if (seenSlugs.has(r.chunk.slug)) return false
    seenSlugs.add(r.chunk.slug)
    return true
  }).slice(0, candidateCount)

  // RE-RANKING (if enabled)
  let finalCandidates = deduplicated.map(r => r.chunk)
  if (ENABLE_RERANK && finalCandidates.length > TOP_K) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ask] Re-ranking ${finalCandidates.length} candidates...`)
    }
    finalCandidates = await rerankChunks(query, finalCandidates, client)
  }

  // TOKEN-BUDGET SELECTION
  const selected: Chunk[] = []
  let used = 0
  const systemTokens = estimateTokens(buildSystemPrompt())

  for (const chunk of finalCandidates) {
    const chunkTokens = chunk.tokenEstimate ?? estimateTokens(chunk.text)
    // Always include at least 1 chunk even if it exceeds the cap
    if (selected.length > 0 && used + chunkTokens + systemTokens > CONTEXT_TOKEN_CAP) break
    selected.push(chunk)
    used += chunkTokens
  }

  return selected
}

function buildSystemPrompt(): string {
  return `You are George's blog assistant.

Your role is to answer questions using ONLY the retrieved blog context provided.

Rules:
- Use the provided context to answer, even if the question is phrased differently to the source material.
- You are allowed and encouraged to infer opinions, preferences, and feelings from what is written. If George dedicated a whole post to a topic, he clearly cares about it. If he reviewed something positively, infer he likes it. Lean towards answering using reasonable inference rather than refusing.
- Never use outside knowledge or invent specific facts not present in the context.
- ONLY reply "I don't have that in my posts." if the context contains nothing whatsoever relevant to the question. If there is any relevant context, use it.
- When you do reply with "I don't have that in my posts.", do NOT include a Sources section.
- Keep answers concise and natural.
- Match George's writing style:
  - casual
  - technical
  - slightly imperfect
  - short paragraphs
  - occasional sentence fragments
- Cite sources inline using:
  (from https://georgeelz.blog/blog/<slug>)
- At the end of a real answer, include:
  Sources:
  - https://georgeelz.blog/blog/<slug>`
}

function buildUserPrompt(question: string, chunks: Chunk[]): string {
  const contextBlock = chunks
    .map(c => `--- SOURCE: https://georgeelz.blog/blog/${c.slug} ---\n${c.text}`)
    .join('\n\n')

  return `CONTEXT:\n${contextBlock}\n\nUSER:\n${question}`
}

// Route
export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = getIp(req)
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { question } = (body ?? {}) as Record<string, unknown>
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return NextResponse.json({ error: 'question is required.' }, { status: 400 })
  }

  if (question.trim().length > 500) {
    return NextResponse.json({ error: 'Question is too long.' }, { status: 400 })
  }

  const sanitized = sanitizeQuestion(question)
  if (sanitized.length === 0) {
    return NextResponse.json({ error: 'question is required.' }, { status: 400 })
  }

  const store = loadStore()
  if (!store || store.chunks.length === 0) {
    return NextResponse.json(
      { error: 'Knowledge base not available. Run the build-embeddings script first.' },
      { status: 503 }
    )
  }

  const client = new OpenAI({ apiKey })

  // Create streaming response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Helper to send progress updates
        const sendProgress = (message: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`))
        }

        // Helper to send content chunks
        const sendContent = (content: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`))
        }

        // Query rewriting
        sendProgress('Optimizing search query...')
        const { rewritten: queryForSearch, tags: extractedTags } = await rewriteQuery(sanitized, client)

        // Embedding
        sendProgress('Searching blog posts...')
        const embeddingRes = await client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: queryForSearch,
        })
        const queryEmbedding = embeddingRes.data[0].embedding

        // Re-ranking
        if (ENABLE_RERANK) {
          sendProgress('Analyzing relevance...')
        }
        
        const selectedChunks = await selectChunks(
          queryForSearch,
          queryEmbedding,
          store.chunks,
          client,
          extractedTags
        )

        if (process.env.NODE_ENV === 'development') {
          console.log('[ask] selected chunks:', selectedChunks.map(c => `${c.id} (${c.tokenEstimate} tokens)`))
          console.log('[ask] user prompt preview:', buildUserPrompt(sanitized, selectedChunks).slice(0, 300))
        }

        if (selectedChunks.length === 0) {
          sendContent("I don't have that in my posts.")
          controller.close()
          return
        }

        // Generate answer
        sendProgress('Generating answer...')
        
        const systemPrompt = buildSystemPrompt()
        if (process.env.NODE_ENV === 'development') {
          console.log('[ask] system prompt length:', systemPrompt.length)
          console.log('[ask] system prompt tail:', JSON.stringify(systemPrompt.slice(-80)))
        }

        const chatStream = await client.chat.completions.create({
          model: CHAT_MODEL,
          temperature: TEMPERATURE,
          max_tokens: RESPONSE_MAX_TOKENS,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildUserPrompt(sanitized, selectedChunks) },
          ],
        })

        // Stream the response
        for await (const chunk of chatStream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            sendContent(content)
          }
        }

        // Signal completion
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        controller.close()
      } catch (error) {
        console.error('[ask] streaming error:', error)
        const errorMessage = error instanceof Error ? error.message : 'An error occurred'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
