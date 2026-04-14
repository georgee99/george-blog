## Notifying subscribers

To email all confirmed subscribers when a new post is published:

1. Open the [AWS Lambda console](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions) and find the function **`george-blog-subscribe-prod-notifySubscribers`**
2. Click the **Test** tab
3. Create a new test event with this JSON (edit subject and body as needed):
   ```json
   {
     "subject": "New post on George's Blog",
     "body": "Hey,\n\nI just published a new post: https://georgeelz.blog/blog/your-post-slug\n\nGeorge"
   }
   ```
4. Click **Test** — the function will email every confirmed subscriber and return `{ "sent": N, "emails": [...] }`
