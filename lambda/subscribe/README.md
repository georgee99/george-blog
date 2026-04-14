## Notifying subscribers

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
