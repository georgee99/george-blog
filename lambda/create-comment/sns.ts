import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({});

export async function publishCommentCreated(
  postSlug: string,
  authorName: string,
  createdAt: Date,
): Promise<void> {
  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) {
    throw new Error('SNS_TOPIC_ARN environment variable is not set');
  }

  await sns.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: `New comment on ${postSlug}`,
      Message: JSON.stringify({
        postSlug,
        authorName,
        createdAt: createdAt.toISOString(),
      }),
    }),
  );
}
