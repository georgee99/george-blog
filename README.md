# George's Blog
https://georgeelz.blog/

Simple and minimal. Nothing special about this, just for fun.

Update: The blog now contains AI 

## Contents

- [Admin area](#admin-area-admin)
- [Comment and guestbook moderation](#comment-and-guestbook-moderation)
- [RAG analytics](#rag-analytics)
- [Environment variables](#environment-variables)
- [AWS deployment](#aws-deployment)
- [Vercel configuration](#vercel-configuration)
- [Maintenance](#maintenance)
- [Production deployment checklist](#production-deployment-checklist)
- [Known limitations](#known-limitations)

## Admin area (`/admin`)

A private, single-administrator area for blog management. The public blog and `/api/ask` need no sign-in.

- **Auth:** Auth.js (Google OAuth, signed JWT cookie sessions, 8h expiry). Only the Google account whose stable `sub` equals `ADMIN_GOOGLE_SUB` is authorised (never the email alone). If `ADMIN_GOOGLE_SUB` is unset, nobody can sign in.
- **Protection is enforced on the server in two layers:** admin pages check the session, and every admin API handler independently calls `requireAdminApi()` (`src/lib/admin-auth.ts`): 401 when signed out, 403 for any other account. New admin APIs must follow this rule.
- **Pages:** `/admin` (section tiles), `/admin/rag` (analytics overview, charts, filters, recent queries), `/admin/queries/<id>` (query detail), and `/admin/moderation` (comments and guestbook). Signed-out visitors are sent to `/admin/login`. Existing `/admin` links with analytics filters redirect to `/admin/rag`.
- **Admin APIs:** `/api/admin/session`, `/api/admin/rag/summary`, `/api/admin/rag/queries`, `/api/admin/rag/queries/<id>`, and `/api/admin/moderation`. They proxy to AWS from the server; AWS API keys never reach the browser.

## Comment and guestbook moderation

The guestbook and blog comments use the same comments table. Guestbook entries have `postSlug = guestbook`; other slugs are treated as blog comments. The table uses `(postSlug, commentId)` as its partition and sort keys. A comment ID is an ISO timestamp followed by `#` and a UUID. Public submissions continue to appear immediately; there is no approval queue.

On `/admin/moderation`, filter by entry type, one or more blogs, and the entry's own visible/hidden setting. The blog filter searches published post titles and slugs from existing comments, including articles no longer published; selecting blogs excludes guestbook entries. Selecting the guestbook type clears the blog filter. Hiding sets `isHidden` to `true`; restoring removes it. Missing `isHidden` means visible, so existing records require no migration. Hiding a parent also hides its replies from public responses without changing the replies' own settings. Restoring a parent does not restore replies hidden individually. The list therefore labels and filters by the entry's **own** setting: a reply labelled visible can still be suppressed by a hidden parent.

Permanent deletion requires confirmation. An entry with replies cannot be deleted until its replies are deleted, including hidden replies. Each new reply atomically increments a version on its parent; deletion checks that version after looking for replies, preventing a concurrent new reply from being orphaned by deletion. A reply to a parent that no longer exists now receives a 409 error instead of creating an orphan. Otherwise submission behavior is unchanged. This guarantee assumes all writers use the updated Lambda; older Lambda deployments and direct table writes bypass it.

The admin list can be sorted newest-to-oldest or oldest-to-newest across all pages. Since the existing table has no global date index, each request scans the whole table, applies type/status filters, and selects the next 30 matching entries in date order. Equal dates are ordered by the entry keys. Pagination is not a snapshot, so concurrent writes or moderation actions can affect later pages. Scan filters do not reduce read capacity consumed; every page costs a full strongly consistent scan and will become slower and more expensive as the table grows. Large tables may require an index or time out. The public comments query follows all DynamoDB pages and uses strongly consistent reads to exclude hidden entries; this increases read cost and large partitions may eventually require a paginated public API.

Deploy the updated comments Lambda before the app when enabling date sorting and blog filtering. Cursors from the old scan-based pagination are incompatible; refresh the moderation page after deployment if a cursor error appears.

Moderation uses a new private API Gateway method and a dedicated Lambda role with scan, query, get, update and delete permissions on the existing table. The Next.js route checks the Auth.js admin session on every request; mutations also check the request origin. The AWS endpoint requires a separate `MODERATION_API_KEY` at API Gateway and verifies it again in the Lambda. The key is a shared credential, not an individual administrator identity: keep it in server-side environment variables and deployment secrets, restrict access to Lambda configuration and CloudFormation templates, and rotate it if exposed. Admin and public responses are not cached. The feature does not maintain an audit log or provide an undo for permanent deletion; verify backups/PITR before deleting.

### Deploying moderation

1. Generate a dedicated random key, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Set `MODERATION_API_KEY` in the GitHub repository secrets for the comments Lambda workflow and in the Vercel server environment. For local Serverless deployment, put it in `.env.local` along with the existing `DYNAMODB_TABLE_NAME` and `SNS_TOPIC_ARN`. Do not reuse the public comments key or prefix this key with `NEXT_PUBLIC_`.
2. Deploy `lambda/create-comment/serverless.yml` using the existing workflow or `npm run deploy` from `lambda/create-comment`. The deployment identity needs permission to manage the additional IAM role, API key and usage plan. Set Vercel `MODERATION_API_URL` to the deployed service URL ending in `/moderation`, and redeploy Vercel. Deploy the Lambda first so public reads filter hidden entries before exposing admin controls.
3. Before and after deployment, verify the existing public comments API key and its externally managed usage plan still work. At inspection time, deployed `GET /comments` and `POST /comments` required an API key, while this requirement was missing from the old checked-in configuration; it is now declared in Serverless. The existing public usage plan and key are not managed by this stack. The new moderation key has its own managed usage plan. Verify that deploying the stack retains the existing association and does not interrupt public reads or submissions. The existing deployed `/reactions` method did not require a key; moderation does not rely on that method for authorization.
4. With an authorized admin account, verify both filters, both date orders across pages, hide/restore, independently hidden replies, deletion confirmation and the parent-with-replies error. Check signed-out admin access and an invalid moderation API key are rejected. Verify public comments and guestbook reads and new submissions still work, and that hidden entries and replies of hidden parents are absent. Do not use production entries for destructive tests unless intended.

The comments table is referenced by name rather than created by this stack. During the initial inspection, the deployed `blog-comments` table was active, on-demand, had the expected composite key, and had no GSI. Confirm these properties and the active API Gateway configuration again in the target account and stage before deployment. `MODERATION_API_URL` and `MODERATION_API_KEY` are required for the admin feature; without them it fails closed and displays an error. For key rotation, update the deployment secret and deploy the AWS stack, then update Vercel and redeploy; moderation is unavailable until both sides match.

## RAG analytics

Every `/api/ask` execution that reaches the RAG pipeline is recorded: per-stage timings (ms), token usage, retrieved chunk ids with hybrid scores, estimated cost and a coarse error category.

- Prompts and retrieved chunk text are **never** stored. Generated answers are stored after best-effort redaction.
- Metrics that were unavailable are omitted rather than stored as zero. The dashboard shows them as "not captured".
- Chunk scores are hybrid ranking scores computed *before* re-ranking, not probabilities or answer confidence. Chunk order is the final order after re-ranking.
- Cost is an estimate from the price table in `src/lib/rag-analytics/pricing.ts` (override with `RAG_MODEL_PRICING_JSON`). Check it against current provider pricing.

### Privacy and retention

The user's question and generated response are stored after redacting emails, URLs, phone-like numbers and key-like tokens (`src/lib/rag-analytics/sanitize.ts`). Redaction is best-effort: free text can still contain personal information. Responses from failed streams may be partial; older records have no response. Every record, including its text, is deleted automatically through a DynamoDB TTL on `expiresAt` (default 30 days; `RAG_ANALYTICS_RETENTION_DAYS`). TTL deletion is asynchronous and can lag by up to ~48 hours, so a record can briefly outlive its expiry. Changing the retention only affects new records. If you don't want text kept at all, remove `queryText` and `responseText` from `RagTrace.toRecord()` in `src/lib/rag-analytics/trace.ts`.

The dashboard displays Sydney time (AEST/AEDT), including date filters and daily totals. The underlying records remain partitioned by UTC day. Deploy the analytics Lambda before the app so the Lambda understands the Sydney date range and response field; records saved before this update cannot show a response.

Visitors can rate a completed answer once, without signing in. The rating is stored on the corresponding analytics record and expires with it; no feedback text or visitor identity is stored. The private dashboard shows ratings, counts for the selected filters, and a negative-rating filter. Older records remain unrated.

The stream's completion event contains a short-lived, response-specific signed feedback capability, not the analytics API key. The server verifies it before forwarding a rating to the private API. A conditional DynamoDB update prevents duplicate ratings even on retries. The public route checks origin and body size and applies a best-effort per-instance rate limit; API Gateway's existing shared usage-plan throttle also applies. These controls limit abuse but anonymous feedback is not proof of a unique person. Feedback can be retried if analytics persistence is delayed or unavailable; it never blocks the answer. Capabilities expire after one hour and become invalid when the analytics key is rotated.

### Failure isolation

Records are sent to AWS from `after()` once the response stream has finished, with a 3s timeout. Any failure (non-2xx response, timeout, unreachable host) is logged and ignored, and the public search is unaffected. If `RAG_ANALYTICS_API_URL` or `RAG_ANALYTICS_API_KEY` is unset, recording is skipped silently. This was verified against an analytics endpoint that returns HTTP 500, never responds, is unreachable, or is not configured.

### Architecture

```
/api/ask (Vercel) --after()--> API Gateway (API key) --> ingest Lambda ---> DynamoDB
/api/ask/feedback (Vercel) --> API Gateway (API key) --> feedback Lambda --> DynamoDB
/admin/rag (Vercel, session) --> API Gateway (API key) --> list / detail Lambdas --> DynamoDB
```

Infrastructure is defined in `lambda/rag-analytics/serverless.yml` (Serverless Framework, `ap-southeast-2`):

| Resource | Details |
| --- | --- |
| DynamoDB table `blog-rag-analytics` | On-demand billing. Partition key `pk` (UTC day, `YYYY-MM-DD`), sort key `sk` (`<timestamp>#<queryId>`). GSI `byQueryId`. TTL on `expiresAt`. `DeletionPolicy: Retain`. |
| `ingest` Lambda | `POST /rag-analytics/queries`. IAM: `dynamodb:PutItem` on the table only. |
| `list` Lambda | `GET /rag-analytics/queries` and `GET /rag-analytics/summary`. IAM: `dynamodb:Query` on the table and `byQueryId` index. |
| `detail` Lambda | `GET /rag-analytics/queries/{queryId}`. Same read-only role as `list`. |
| `feedback` Lambda | `POST /rag-analytics/feedback`. IAM: `dynamodb:GetItem` and `dynamodb:UpdateItem` on the table only. |
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
| `RAG_ANALYTICS_API_KEY` | yes | Server-only shared secret for the analytics API and signing feedback capabilities; never expose to the browser |
| `MODERATION_API_URL` | moderation | Comments service URL ending in `/moderation` |
| `MODERATION_API_KEY` | moderation | Dedicated server-to-server moderation API key |
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

- After the initial deployment, pushes to `master` that change `lambda/rag-analytics/**` automatically type-check and deploy this service through the `Deploy RAG Analytics Lambda` GitHub workflow. The workflow can also be started manually.
- Deploy the analytics stack before the app to add the private feedback endpoint and its IAM role. No new environment variables are required; the deployment role must be allowed to create/update the Lambda, API Gateway method and IAM role. Do not deploy as part of review.
- Configure the GitHub repository secrets `AWS_DEPLOY_ROLE_ARN` (an AWS OIDC role with permission to deploy this service's CloudFormation resources) and `RAG_ANALYTICS_API_KEY` (the same value configured in Vercel). The AWS deployment role secret is also used by the existing Lambda workflow.
- The table has `DeletionPolicy: Retain`: removing the stack leaves the table (and its data) behind. Delete it manually if you really want it gone.
- `serverless print` (run via `npx dotenv -e ../../.env.local -- serverless print`) validates the config without deploying.

## Vercel configuration

1. Add the variables above to the **Production** environment (and Preview only if you want analytics or admin there).
2. In Google Cloud Console → APIs & Services → Credentials → your Web OAuth client, add the authorised redirect URI `https://georgeelz.blog/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local development).
3. Redeploy so the new variables take effect (environment variables are read at build/start, not live).
4. To find your `ADMIN_GOOGLE_SUB`, sign in locally while temporarily logging `profile.sub` in the `signIn` callback of `src/auth.ts`, or read the `sub` claim of a Google ID token. Do not commit that logging.
5. Environment variables set in your shell take precedence over `.env.local`. If local sign-in or OpenAI calls use the wrong credentials, check `Test-Path Env:OPENAI_API_KEY` (PowerShell) and remove stale values.

## Maintenance

### Cat oracle images

The cat oracle uses pre-generated WebP images to avoid optimizing its PNGs on
request. After adding or changing an M- or S-prefixed PNG in `public/meow`, run
`npm run optimize-cat-oracle` and commit the resulting files in
`public/meow/oracle` with the original PNGs.

### Additional admin dashboards

- `/admin/subscribers` displays subscriber addresses and current status counts.
  The list uses paginated DynamoDB scans, is not chronologically sorted, and
  counts require a full scan. Counts can change during the scan.
- `/admin/newsletters` displays new newsletter send attempts and Resend
  acceptance counts. It does not show confirmed deliveries or older sends.
- `/admin/rag/coverage` compares this deployment's published posts with the
  bundled embeddings artifact. It does not invoke OpenAI or rebuild embeddings.
- `/admin/health` performs short, read-only checks when opened. The moderation
  check only reports configuration, and newsletter delivery is not probed.

The subscriber and newsletter pages require the subscriber stack and matching
`SUBSCRIBER_ADMIN_API_URL` and `SUBSCRIBER_ADMIN_API_KEY` in Vercel. Deploy the
AWS changes first, then update and redeploy the app. See
[subscriber deployment and history notes](lambda/subscribe/README.md#subscriber-overview-and-newsletter-history)
for configuration, IAM, retention and retry behavior. Like the existing admin
areas, these pages require the configured Auth.js administrator.

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
- [ ] Rate a completed answer while signed out; confirm the rating, counts and filter in the authenticated dashboard, and confirm a second submission is rejected
- [ ] `/admin` while signed out redirects to the private-area sign-in page; `/api/admin/session` returns 401
- [ ] Signing in with the admin Google account opens the dashboard; **Sign out** returns you to the sign-in page and `/admin` is protected again
- [ ] Signing in with any other Google account is rejected (use a second account or an incognito window)
- [ ] After asking a question, a new row appears in the RAG analytics dashboard (try 2d, then clear the date/status filters), and its detail page shows the redacted response, timings, tokens, cost and ranked chunks
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
