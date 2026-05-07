import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'

// Config
const EMBEDDING_MODEL = 'text-embedding-3-small'
const CHAT_MODEL = 'gpt-4o-mini'
const TOP_K = 4
const SIMILARITY_THRESHOLD = 0.25
const CONTEXT_TOKEN_CAP = 1500
const RESPONSE_MAX_TOKENS = 250
const TEMPERATURE = 0.3
const CHARS_PER_TOKEN = 4
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

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

function loadStore(): EmbeddingsStore | null {
  const storePath = path.join(process.cwd(), 'data/embeddings.json')
  if (!fs.existsSync(storePath)) return null
  return JSON.parse(fs.readFileSync(storePath, 'utf-8')) as EmbeddingsStore
}

function selectChunks(queryEmbedding: number[], chunks: Chunk[]): Chunk[] {
  const scored = chunks
    .map(c => ({ chunk: c, score: cosine(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)

  if (process.env.NODE_ENV === 'development') {
    console.log('[ask] top scores:',
      scored.slice(0, 5).map(r => `${r.chunk.slug} (${r.score.toFixed(4)})`).join(', ')
    )
  }

  const filtered = scored
    .filter(r => r.score >= SIMILARITY_THRESHOLD)
    .slice(0, TOP_K)

  // Token-budget selection
  const selected: Chunk[] = []
  let used = 0
  const systemTokens = estimateTokens(buildSystemPrompt())

  for (const { chunk } of filtered) {
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
  (from "<slug>")
- At the end of a real answer, include:
  Sources:
  - <slug>`
}

function buildUserPrompt(question: string, chunks: Chunk[]): string {
  const contextBlock = chunks
    .map(c => `--- SOURCE: ${c.slug} ---\n${c.text}`)
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

  // Embed the question
  const embeddingRes = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: sanitized,
  })
  const queryEmbedding = embeddingRes.data[0].embedding

  // Retrieve relevant chunks
  const selectedChunks = selectChunks(queryEmbedding, store.chunks)

  if (process.env.NODE_ENV === 'development') {
    console.log('[ask] selected chunks:', selectedChunks.map(c => `${c.id} (${c.tokenEstimate} tokens)`))
    console.log('[ask] user prompt preview:', buildUserPrompt(sanitized, selectedChunks).slice(0, 300))
  }

  if (selectedChunks.length === 0) {
    return NextResponse.json({ answer: "I don't have that in my posts." })
  }

  // Call chat model
  const systemPrompt = buildSystemPrompt()
  if (process.env.NODE_ENV === 'development') {
    console.log('[ask] system prompt length:', systemPrompt.length)
    console.log('[ask] system prompt tail:', JSON.stringify(systemPrompt.slice(-80)))
  }

  const chatRes = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: TEMPERATURE,
    max_tokens: RESPONSE_MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserPrompt(sanitized, selectedChunks) },
    ],
  })

  const answer = chatRes.choices[0]?.message?.content?.trim() ?? "I don't have that in my posts."

  return NextResponse.json({ answer })
}
