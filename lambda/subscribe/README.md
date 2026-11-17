## Notifying subscribers

The normal path is automated by `.github/workflows/notify-subscribers.yml`:

- A push to `main` that changes exactly one post under `content/posts/` generates the email and invokes `george-blog-subscribe-prod-notifySubscribers` through AWS Lambda's private API.
- The workflow can also be started manually from GitHub Actions with a post slug.
- GitHub authenticates to AWS with OIDC using the `AWS_NOTIFY_ROLE_ARN` repository secret. No public Lambda Function URL is required.

The workflow does not send automatically when a push changes zero or multiple posts. Use its manual dispatch option in that case.

## Manual fallback

To email all confirmed subscribers when a new post is published:

1. Generate the test event JSON from the repo root:
   ```bash
   npm run generate-email-html-default
   ```
   Or with a specific post slug:
   ```bash
   npm run generate-email-html -- --slug my-post-slug --subject "New post on George's Blog" --author "George"
   ```
   This saves the JSON to `scripts/generate-email/email-test.json` and prints it to the terminal.

2. Open the [AWS Lambda console](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions) and find the function **`george-blog-subscribe-prod-notifySubscribers`**
3. Click the **Test** tab
4. Paste the generated JSON into the test event body.
5. Click **Test** — the function will email every confirmed subscriber and return `{ "sent": N, "emails": [...] }`. Each console invocation gets a new campaign ID unless the event includes one; repeating it can send duplicates.

## Subscriber overview and newsletter history

The subscriber stack also provides a private, read-only admin endpoint at
`GET /admin/subscribers`. It requires `SUBSCRIBER_ADMIN_API_KEY` both at API
Gateway and in the Lambda. It supports subscriber pages, status counts, a
minimal health check and newsletter history. Subscriber page cursors are
encrypted; changing the key invalidates existing cursors.

For deployment, set `SUBSCRIBER_ADMIN_API_KEY` to a new strong, random API key
of at least 20 characters in the deployment environment. Deploy the stack with
the existing subscriber variables (`SUBSCRIBERS_TABLE_NAME`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` and `SITE_BASE_URL`) still set.
From this directory, the existing `npm run deploy` loads the repository's
`.env.local`; shell environment variables take precedence. Alternatively use
your established Serverless deployment environment. No GitHub workflow
currently deploys this stack automatically.

Set `SUBSCRIBER_ADMIN_API_KEY` to the same value in Vercel and set
`SUBSCRIBER_ADMIN_API_URL` to the complete deployed URL ending in
`/admin/subscribers`. Do not use a `NEXT_PUBLIC_` prefix. Redeploy Vercel after
updating the variables. The API key is server-to-server only; browser access
to the admin pages still requires the Auth.js admin session.

The stack creates a pay-per-request DynamoDB history table with a
`byStartTime` index. Records are retained indefinitely, including if the
stack is deleted; retain and recover the physical table deliberately if the
stack is recreated. The deployment identity needs permissions for this table
and index, the new Lambda, roles and API Gateway key/usage-plan resources.
Check the existing API Gateway deployment and any externally managed usage
plans before deployment; this stack adds a usage plan, but does not intentionally
make existing public endpoints private.

History starts with sends after deployment. It stores subject, optional post
slug, run ID, timestamps, state and aggregate recipient/attempt/acceptance
counts, but no email bodies, recipient addresses or tokens. Accepted means
Resend returned IDs, not that messages were delivered. Delivery events are
not tracked. A failed or still-in-progress run can contain messages that were
sent despite an uncertain result. Review it before another send.

The GitHub workflow uses its run ID as a campaign ID. A rerun of the same
workflow run is blocked from sending again, including after a failure; start a
new run only after checking the previous outcome. A manual Lambda invocation
without a campaign ID generates a new ID and is not deduplicated against other
manual invocations. History writes must succeed before sending; if the history
table is unavailable the newsletter will not start, and an error while
recording a batch stops subsequent batches. Check Lambda logs and history
before retrying. An interrupted Lambda can remain marked in progress.
