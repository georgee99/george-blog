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
5. Click **Test** — the function will email every confirmed subscriber and return `{ "sent": N, "emails": [...] }`
