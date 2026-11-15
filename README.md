# George's Blog
https://georgeelz.blog/

Simple and minimal. Nothing special about this, just for fun.

Update: The blog now contains AI 

## Contents

- [Admin area](#admin-area-admin)
- [RAG analytics](#rag-analytics)
- [Environment variables](#environment-variables)
- [AWS deployment](#aws-deployment)
- [Vercel configuration](#vercel-configuration)
- [Maintenance](#maintenance)
- [Production deployment checklist](#production-deployment-checklist)
- [Known limitations](#known-limitations)

## Admin area (`/admin`)

A private, single-administrator dashboard for the RAG search. The public blog and `/api/ask` need no sign-in.

- **Auth:** Auth.js (Google OAuth, signed JWT cookie sessions, 8h expiry). Only the Google account whose stable `sub` equals `ADMIN_GOOGLE_SUB` is authorised (never the email alone). If `ADMIN_GOOGLE_SUB` is unset, nobody can sign in.
- **Protection is enforced on the server in two layers:** admin pages check the session, and every admin API handler independently calls `requireAdminApi()` (`src/lib/admin-auth.ts`): 401 when signed out, 403 for any other account. New admin APIs must follow this rule.
- **Pages:** `/admin` (overview, charts, filters, recent queries) and `/admin/queries/<id>` (query detail). Signed-out visitors are sent to `/admin/login`.
- **Admin APIs:** `/api/admin/session`, `/api/admin/rag/summary`, `/api/admin/rag/queries`, `/api/admin/rag/queries/<id>`. They proxy to the AWS analytics API; the AWS API key never reaches the browser.

## RAG analytics

Every `/api/ask` execution that reaches the RAG pipeline is recorded: per-stage timings (ms), token usage, retrieved chunk ids with hybrid scores, estimated cost and a coarse error category.

- Prompts, retrieved chunk text and generated answers are **never** stored.
- Metrics that were unavailable are omitted rather than stored as zero. The dashboard shows them as "not captured".
- Chunk scores are hybrid ranking scores computed *before* re-ranking, not probabilities or answer confidence. Chunk order is the final order after re-ranking.
- Cost is an estimate from the price table in `src/lib/rag-analytics/pricing.ts` (override with `RAG_MODEL_PRICING_JSON`). Check it against current provider pricing.

### Privacy and retention

The user's question is stored after redacting emails, URLs, phone-like numbers and key-like tokens (`src/lib/rag-analytics/sanitize.ts`). Redaction is best-effort: free text can still contain personal information. Every record, including its query text, is deleted automatically through a DynamoDB TTL on `expiresAt` (default 30 days; `RAG_ANALYTICS_RETENTION_DAYS`). TTL deletion is asynchronous and can lag by up to ~48 hours, so a record can briefly outlive its expiry. Changing the retention only affects new records. If you don't want query text kept at all, remove `queryText` from `RagTrace.toRecord()` in `src/lib/rag-analytics/trace.ts`.

### Failure isolation

Records are sent to AWS from `after()` once the response stream has finished, with a 3s timeout. Any failure (non-2xx response, timeout, unreachable host) is logged and ignored, and the public search is unaffected. If `RAG_ANALYTICS_API_URL` or `RAG_ANALYTICS_API_KEY` is unset, recording is skipped silently. This was verified against an analytics endpoint that returns HTTP 500, never responds, is unreachable, or is not configured.

### Architecture

```
/api/ask (Vercel) --after()--> API Gateway (API key) --> ingest Lambda ---> DynamoDB
/admin   (Vercel, session)  --> API Gateway (API key) --> list / detail Lambdas --> DynamoDB
```

Infrastructure is defined in `lambda/rag-analytics/serverless.yml` (Serverless Framework, `ap-southeast-2`):

| Resource | Details |
| --- | --- |
| DynamoDB table `blog-rag-analytics` | On-demand billing. Partition key `pk` (UTC day, `YYYY-MM-DD`), sort key `sk` (`<timestamp>#<queryId>`). GSI `byQueryId`. TTL on `expiresAt`. `DeletionPolicy: Retain`. |
| `ingest` Lambda | `POST /rag-analytics/queries`. IAM: `dynamodb:PutItem` on the table only. |
| `list` Lambda | `GET /rag-analytics/queries` and `GET /rag-analytics/summary`. IAM: `dynamodb:Query` on the table and `byQueryId` index. |
| `detail` Lambda | `GET /rag-analytics/queries/{queryId}`. Same read-only role as `list`. |
| API Gateway | Every route has `apiKeyRequired`; usage plan throttles at 10 req/s (burst 20). Each Lambda also re-checks the key (constant-time) so a gateway misconfiguration cannot expose data. |
| CloudWatch Logs | 30 day retention. Only error messages are logged, never query text. |

The ingest Lambda validates every field (whitelist, type and range checks, 32KB body cap, timestamp within 24h of now) and rejects duplicate query ids.

## Environment variables

### Vercel (Project Settings → Environment Variables → Production)

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | RAG search (existing) |
| `AUTH_SECRET` | yes | Signs session cookies. Generate with `npx auth secret` |
| `AUTH_GOOGLE_ID` | yes | Google OAuth **Client ID** (ends `.apps.googleusercontent.com`) |
| `AUTH_GOOGLE_SECRET` | yes | Google OAuth client secret |
| `ADMIN_GOOGLE_SUB` | yes | Stable Google account id (`sub`) of the single administrator |
| `RAG_ANALYTICS_API_URL` | yes | API base URL, ending `/rag-analytics` (no trailing `/queries`) |
| `RAG_ANALYTICS_API_KEY` | yes | Shared secret for the analytics API |
| `RAG_MODEL_PRICING_JSON` | no | Price override, USD per 1M tokens, e.g. `{"gpt-4o-mini":{"inputPerMTok":0.15,"outputPerMTok":0.6}}` |

None of these may be prefixed with `NEXT_PUBLIC_`. Set the same values in `.env.local` for local development (`.env*` is git-ignored).

### AWS deployment (`.env.local` at the repo root, read by `npm run deploy`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `RAG_ANALYTICS_API_KEY` | yes | Becomes the API Gateway key value and the Lambda's expected key. Must match Vercel. 20+ characters |
| `RAG_ANALYTICS_RETENTION_DAYS` | no | Record retention for **new** records, default `30` |

Generate a key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## AWS deployment

Prerequisites: Node 20, AWS credentials with permission to manage CloudFormation, Lambda, API Gateway, IAM roles and DynamoDB (`aws sts get-caller-identity` should succeed).

```bash
cd lambda/rag-analytics
npm install
npm run deploy      # loads ../../.env.local, then runs serverless deploy
```

The command prints the endpoint URLs. Take the shared prefix up to and including `/rag-analytics` as `RAG_ANALYTICS_API_URL`, e.g. `https://abc123.execute-api.ap-southeast-2.amazonaws.com/prod/rag-analytics`.

Notes:

- This service is **not** part of the `Deploy Lambda` GitHub workflow (that only covers `lambda/create-comment`). Deploy it manually when its code changes.
- The table has `DeletionPolicy: Retain`: removing the stack leaves the table (and its data) behind. Delete it manually if you really want it gone.
- `serverless print` (run via `npx dotenv -e ../../.env.local -- serverless print`) validates the config without deploying.

## Vercel configuration

1. Add the variables above to the **Production** environment (and Preview only if you want analytics or admin there).
2. In Google Cloud Console → APIs & Services → Credentials → your Web OAuth client, add the authorised redirect URI `https://georgeelz.blog/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local development).
3. Redeploy so the new variables take effect (environment variables are read at build/start, not live).
4. To find your `ADMIN_GOOGLE_SUB`, sign in locally while temporarily logging `profile.sub` in the `signIn` callback of `src/auth.ts`, or read the `sub` claim of a Google ID token. Do not commit that logging.
5. Environment variables set in your shell take precedence over `.env.local`. If local sign-in or OpenAI calls use the wrong credentials, check `Test-Path Env:OPENAI_API_KEY` (PowerShell) and remove stale values.

## Maintenance

**Rotate the analytics API key**

1. Generate a new key and put it in `.env.local` as `RAG_ANALYTICS_API_KEY`.
2. Redeploy the Lambda (`npm run deploy`) and update the Vercel variable, then redeploy Vercel. Until both are updated, analytics recording silently pauses and the dashboard shows "Analytics service returned 403"; public search is unaffected.

**Change the admin account:** update `ADMIN_GOOGLE_SUB` in Vercel and redeploy. Existing sessions for the old account stop working immediately, because the `sub` is checked on every request.

**Rotate `AUTH_SECRET`:** update it in Vercel and redeploy. All existing admin sessions are invalidated.

**Change retention:** set `RAG_ANALYTICS_RETENTION_DAYS` and run `npm run deploy`. Existing records keep their original expiry.

**Update model prices:** edit `src/lib/rag-analytics/pricing.ts` or set `RAG_MODEL_PRICING_JSON` in Vercel. Historical records keep the cost that was calculated when they were written (each stores its `pricingVersion`).

**Add a new model or stage:** add it to the price table, and to `STAGES` in both `src/lib/rag-analytics/types.ts` and `lambda/rag-analytics/types.ts`. Unknown models are recorded with usage but with cost unavailable.

**Delete data on request:** items live under `pk = <UTC day>`. Delete them in the DynamoDB console or CLI (`aws dynamodb delete-item`). TTL removes everything automatically anyway.

**Pause analytics:** remove `RAG_ANALYTICS_API_URL` (or the key) from Vercel and redeploy. Search keeps working and nothing is recorded.

**Check health:** the AWS console shows Lambda errors and API Gateway 4XX/5XX metrics; `aws logs tail /aws/lambda/george-blog-rag-analytics-prod-ingest --since 1h` shows recent ingest errors. In Vercel logs, look for `[rag-analytics] persist failed`.

## Production deployment checklist

Before the first deploy:

- [ ] `npm run lint`, `npx tsc --noEmit` and `npm run build` pass
- [ ] `lambda/rag-analytics`: `npx tsc --noEmit` passes; `npm run deploy` succeeded and printed the endpoint URLs
- [ ] AWS: table `blog-rag-analytics` is `ACTIVE`, TTL is `ENABLED` on `expiresAt` (`aws dynamodb describe-time-to-live --table-name blog-rag-analytics`)
- [ ] All Vercel variables above are set for **Production** and none uses `NEXT_PUBLIC_`
- [ ] `RAG_ANALYTICS_API_KEY` is identical in Vercel and the Lambda deployment
- [ ] Google OAuth client has the production redirect URI, and the consent screen is published or lists your account as a test user
- [ ] No debug logging of `profile.sub`, keys or tokens remains in `src/auth.ts`
- [ ] The old, unused table (if any) from earlier experiments is deleted

After deploying, on `https://georgeelz.blog`:

- [ ] Public pages and `/ask` work while signed out; `/api/ask` streams an answer
- [ ] `/admin` while signed out redirects to the private-area sign-in page; `/api/admin/session` returns 401
- [ ] Signing in with the admin Google account opens the dashboard; **Sign out** returns you to the sign-in page and `/admin` is protected again
- [ ] Signing in with any other Google account is rejected (use a second account or an incognito window)
- [ ] After asking a question, a new row appears in the dashboard (try 24h, then clear the date/status filters), and its detail page shows timings, tokens, cost and ranked chunks
- [ ] The row's DynamoDB item has `expiresAt` roughly 30 days ahead
- [ ] A failing question path still shows up as a failed row (optional)
- [ ] Vercel function logs show no `[rag-analytics] persist failed` errors

## Known limitations

- **Summary scans the whole range.** `/summary` reads every record in the selected days (max 92). That is fine at blog volume but will slow down, and could hit the API Gateway 29s limit, if traffic grows to many thousands of queries per month. Daily rollups would fix this.
- **The status filter runs after the key lookup**, so filtered views still read each day's items.
- **TTL lag:** expired records can remain visible for up to ~48 hours.
- **Error messages in the public SSE stream:** `/api/ask` forwards the upstream error message to the browser (pre-existing behaviour). Provider errors such as an invalid OpenAI key can include a masked key fragment. Analytics only store a coarse category.
- **Rate limiting on `/api/ask` is in-memory per serverless instance**, so it is best-effort and does not apply to analytics.
- **The analytics API key is a shared secret.** It sits in Vercel env vars and the Lambda configuration (readable by anyone with AWS `lambda:GetFunctionConfiguration`). Rotate it if either is exposed.
- **One administrator, no audit log** of admin page views.
- No automated tests (a deliberate choice for this release). Use the checklist above.

