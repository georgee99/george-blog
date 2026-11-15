# George's Blog
https://georgeelz.blog/

Simple and minimal. Nothing special about this, just for fun.

Update: The blog now contains AI 

## Admin area (`/admin`)

Private, single-administrator area using Auth.js (Google OAuth, JWT cookie sessions, 8h expiry). The public blog and `/api/ask` need no sign-in. Access is granted only to the Google account whose stable `sub` matches `ADMIN_GOOGLE_SUB`; with it unset, nobody is authorised. Every admin API handler must call `requireAdminApi()` from `src/lib/admin-auth.ts`.

Server-side environment variables (Vercel project settings / `.env.local`):

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Random secret for signing sessions (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client credentials |
| `ADMIN_GOOGLE_SUB` | Google account `sub` allowed to sign in |

In Google Cloud Console, add the authorised redirect URIs `https://georgeelz.blog/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. To find your `sub`, use the Google OAuth Playground and read the `sub` claim of the ID token.

## RAG analytics

Every `/api/ask` execution that reaches the RAG pipeline is recorded: per-stage timings (ms), token usage, retrieved chunk ids and hybrid scores, estimated cost, and a coarse error category. Prompts, chunk text and answers are never stored. Unavailable metrics are omitted rather than stored as zero. Scores are ranking scores, not probabilities or answer confidence.

**Privacy:** the user's question is stored for 30 days after redacting emails, URLs, phone-like numbers and key-like tokens. Records expire automatically through a DynamoDB TTL (`RAG_ANALYTICS_RETENTION_DAYS`, default 30; changing it only affects new records).

**Failure isolation:** records are sent to AWS from `after()` once the response has been sent, with a 3s timeout; any failure is logged and ignored. If `RAG_ANALYTICS_API_URL` or `RAG_ANALYTICS_API_KEY` is unset, recording is skipped.

Infrastructure lives in `lambda/rag-analytics` (Serverless Framework): one DynamoDB table (`blog-rag-analytics`, partitioned by UTC day, `byQueryId` index, TTL on `expiresAt`, retained on stack deletion) and three functions with separate least-privilege roles: `ingest` (PutItem only), `list` (history + summary) and `detail` (Query only). All routes require the API key, which is also verified in code. Only the Next.js server holds the key.

Deploy:

1. Add to `.env.local` (and Vercel): `RAG_ANALYTICS_API_KEY` — a random 32+ character secret, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. `cd lambda/rag-analytics && npm install && npm run deploy`.
3. Copy the printed base URL, ending `/rag-analytics`, into `RAG_ANALYTICS_API_URL` in Vercel and `.env.local`.

| Variable | Where | Purpose |
| --- | --- | --- |
| `RAG_ANALYTICS_API_URL` | Vercel | Base URL of the deployed API, ending `/rag-analytics` |
| `RAG_ANALYTICS_API_KEY` | Vercel + deploy | Shared secret for the analytics API |
| `RAG_ANALYTICS_RETENTION_DAYS` | Deploy (optional) | Record retention, default 30 |
| `RAG_MODEL_PRICING_JSON` | Vercel (optional) | Override model prices, USD per 1M tokens |

Cost figures are estimates from the built-in price table in `src/lib/rag-analytics/pricing.ts`; check it against current provider pricing.