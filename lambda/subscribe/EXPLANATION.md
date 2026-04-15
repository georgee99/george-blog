# Subscribe Lambda — Explanation

This folder contains all AWS Lambda functions that power the email subscription system for the blog. They are deployed as a single Serverless Framework service (`george-blog-subscribe`) and each function is bundled independently by esbuild.

All subscriber data lives in a single DynamoDB table (`blog-subscribers`), with `email` as the primary key.

---

## Architecture Overview

```
Browser / Blog
    │
    ├─── POST /subscribe        → subscribe.ts      → DynamoDB + SES (confirmation email)
    ├─── GET  /subscribe/confirm → confirm.ts        → DynamoDB
    └─── GET  /subscribe/unsubscribe → unsubscribe.ts → DynamoDB → redirect to blog

AWS SES (bounce/complaint events)
    │
    └─── SNS Topic ──────────────→ bounce-handler.ts → DynamoDB

AWS Console (manual invoke)
    └─── Test tab ───────────────→ notify.ts          → DynamoDB (scan) + SES (bulk email)
```

---

## Functions

### 1. `subscribe` — `subscribe.ts`

**Trigger:** HTTP POST `/subscribe` via API Gateway (called by the blog's subscribe form)

**What it does:**

1. Parses the JSON body and validates the `email` field (presence + basic regex check).
2. Looks up the email in DynamoDB.
   - If already `confirmed` → returns `200 already subscribed` immediately (no email sent).
   - If already `pending` → refreshes the confirmation token and re-sends the confirmation email. This handles the case where someone submitted the form but never clicked the link.
   - If not found → creates a new subscriber record with `status: pending`, a fresh UUID as the `confirmationToken`, and the current timestamp.
3. Sends a confirmation email via SES (HTML + plain text) with a tokenised confirmation link.

**DynamoDB write:** `PutItem` with the full subscriber object.

**Subscriber record shape:**
```json
{
  "email": "someone@example.com",
  "status": "pending",
  "confirmationToken": "uuid-v4",
  "createdAt": "2026-04-15T00:00:00.000Z",
  "confirmedAt": null,
  "source": "blog" // optional, passed from the form
}
```

---

### 2. `confirm` — `confirm.ts`

**Trigger:** HTTP GET `/subscribe/confirm?email=...&token=...` via API Gateway (the link inside the confirmation email)

**What it does:**

1. Reads `email` and `token` from the query string.
2. Looks up the subscriber in DynamoDB.
   - Not found → `400 Invalid confirmation link`
   - Already `confirmed` → `200 Already confirmed` (idempotent)
   - Token mismatch → `400 Invalid confirmation link`
3. If the token matches, sets `status: confirmed` and records `confirmedAt` timestamp via a DynamoDB `UpdateItem`.

After confirmation, the subscriber will start receiving notification emails from `notify.ts`.

---

### 3. `unsubscribe` — `unsubscribe.ts`

**Trigger:** HTTP GET `/subscribe/unsubscribe?email=...&token=...` via API Gateway

This endpoint is reached in two ways:
- Clicking the **Unsubscribe** link at the bottom of a notification email.
- An email client using the **List-Unsubscribe-Post** one-click mechanism (some mail clients do this automatically on the user's behalf).

**What it does:**

1. Reads `email` and `token` from the query string.
2. Looks up the subscriber in DynamoDB.
   - Missing params → redirects to `/?unsubscribe=invalid`
   - Not found → redirects to `/?unsubscribe=notfound`
   - Token mismatch → redirects to `/?unsubscribe=invalid`
   - Already unsubscribed → redirects to `/?unsubscribe=already`
3. Sets `status: unsubscribed` via a DynamoDB `UpdateItem`.
4. Redirects (`302`) back to the blog homepage with `?unsubscribe=success`.

The blog's frontend can read the `unsubscribe` query param to show a toast or confirmation message.

**Security note:** The `token` used here is the same `confirmationToken` UUID generated at subscription time. It acts as a secret — only someone who received the original emails will know it.

---

### 4. `bounceHandler` — `bounce-handler.ts`

**Trigger:** SNS subscription — the `SESBounceComplaintTopic` SNS topic, which is configured in the SES Console to receive SES bounce and complaint events for the verified domain.

This function is **not exposed via HTTP**. It is invoked automatically by AWS whenever SES reports a bounce or complaint.

**What it does:**

Loops over all SNS records in the event. For each one, it parses the JSON message body (which is a SES notification) and handles two notification types:

- **Bounce (`notificationType: "Bounce"`)**
  - `bounceType: "Permanent"` (e.g. address doesn't exist, domain invalid) → sets subscriber `status: bounced`. Future `notify` runs will skip them.
  - `bounceType: "Transient"` (e.g. mailbox full, server temporarily unavailable) → logs only, does **not** change the status. These bounces may resolve themselves.

- **Complaint (`notificationType: "Complaint"`)**
  - The recipient marked the email as spam → sets subscriber `status: complained`. Future `notify` runs will skip them.

**Why this matters:** AWS requires senders to handle bounces and complaints to maintain a healthy sending reputation. Continuing to email invalid addresses or complainers can get your SES account suspended.

---

### 5. `notifySubscribers` — `notify.ts`

**Trigger:** Manual invocation only — via the **Test** tab in the AWS Lambda console. There is no HTTP endpoint for this function.

This is the function you run whenever you publish a new blog post.

**What it does:**

1. Scans DynamoDB for all subscribers with `status: confirmed`. (Uses paginated `Scan` to handle large lists.)
2. For each confirmed subscriber:
   - Builds a **tokenised unsubscribe URL** unique to that subscriber: `/api/subscribe/unsubscribe?email=...&token=...`
   - Injects the unsubscribe URL into the HTML email body (replacing the placeholder `href` if present, or appending a footer).
   - Appends the unsubscribe URL to the plaintext fallback.
   - Builds a **raw MIME email** with `List-Unsubscribe` and `List-Unsubscribe-Post` headers (required for one-click unsubscribe support in Gmail, Apple Mail, etc.).
   - Sends the email via `SendRawEmailCommand`.
3. Returns `{ sent: N, emails: [...] }`.

**Why raw MIME?** The standard `SendEmailCommand` doesn't allow custom email headers. `SendRawEmailCommand` requires you to hand-craft the MIME format, which is why there's a `buildRawEmail()` helper that constructs the headers and multipart body manually.

**Input payload shape** (paste this into the Lambda Test tab):
```json
{
  "subject": "New post: My Title",
  "body": "Plain text version of the post summary.",
  "html": "<html>...optional HTML version...</html>"
}
```
Use `npm run generate-email-html-default` (from the repo root) to generate this JSON automatically from the latest post.

---

## Shared Modules

### `db.ts` — DynamoDB helpers

Provides typed functions used across all Lambda handlers:

| Function | What it does |
|---|---|
| `getSubscriber(email)` | `GetItem` — fetch one subscriber by email |
| `putSubscriber(subscriber)` | `PutItem` — write a full subscriber record |
| `confirmSubscriber(email, confirmedAt)` | `UpdateItem` — set `status: confirmed` + `confirmedAt` |
| `setSubscriberStatus(email, status)` | `UpdateItem` — set `status` to `unsubscribed`, `bounced`, or `complained` |

The `Subscriber` interface defines the shape of every record in DynamoDB, including the full set of possible statuses: `pending | confirmed | unsubscribed | bounced | complained`.

---

### `ses.ts` — SES confirmation email

Contains `sendConfirmationEmail(email, token)`, used only by `subscribe.ts`. Sends the HTML + plain text confirmation email via `SendEmailCommand`. The email contains a single CTA button pointing to the `/subscribe/confirm` endpoint.

This uses `SendEmailCommand` (not raw MIME) because the confirmation email doesn't need custom headers — there's no need for a `List-Unsubscribe` header since the subscription isn't yet confirmed.

---

## Subscriber Lifecycle

```
[form submit]
     │
     ▼
  pending  ──(confirms link)──▶  confirmed  ──(notify emails)──▶ ...
     │                               │
     │                        (unsubscribes)
     │                               │
     │                           unsubscribed
     │
  (SES permanent bounce) ──▶  bounced
  (SES complaint)        ──▶  complained
```

Only `confirmed` subscribers receive notification emails. All other statuses are skipped by `notify.ts`.
