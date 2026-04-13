import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({});

function getSenderEmail(): string {
  const email = process.env.SES_SENDER_EMAIL;
  if (!email) throw new Error('SES_SENDER_EMAIL environment variable is not set');
  return email;
}

function getSiteBaseUrl(): string {
  const url = process.env.SITE_BASE_URL;
  if (!url) throw new Error('SITE_BASE_URL environment variable is not set');
  return url.replace(/\/$/, '');
}

export async function sendConfirmationEmail(
  toEmail: string,
  token: string,
): Promise<void> {
  const confirmUrl =
    `${getSiteBaseUrl()}/api/subscribe/confirm` +
    `?email=${encodeURIComponent(toEmail)}&token=${encodeURIComponent(token)}`;

  await ses.send(
    new SendEmailCommand({
      Source: getSenderEmail(),
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: 'Confirm your subscription' },
        Body: {
          Text: {
            Data:
              `Hi,\n\nClick the link below to confirm your subscription to George's Blog:\n\n` +
              `${confirmUrl}\n\nIf you did not request this, you can safely ignore this email.\n`,
          },
        },
      },
    }),
  );
}
