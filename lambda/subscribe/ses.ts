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
  const plain =
    `Hi,\n\nClick the link below to confirm your subscription to George's Blog:\n\n` +
    `${confirmUrl}\n\nIf you did not request this, you can safely ignore this email.\n`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Confirm subscription</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Confirm your subscription to George's Blog</span>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:40px 16px;">
      <table width="560" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;">
        <!-- header -->
        <tr><td style="padding:32px 32px 0;text-align:left;border-bottom:2px solid #111111;">
          <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#111111;">George's Blog</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#111111;line-height:1.3;">Confirm your subscription</h1>
        </td></tr>
        <!-- cat photo -->
        <tr><td style="padding:0;">
          <img src="https://georgeelz.blog/meow/M7.png" alt="" width="560" style="display:block;width:100%;max-width:560px;height:220px;object-fit:cover;" />
        </td></tr>
        <!-- body -->
        <tr><td style="padding:32px;color:#111111;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi,</p>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;">Click the button below to confirm your subscription to <strong>George's Blog</strong>.</p>
          <p style="margin:0 0 28px;text-align:left;">
            <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;">Confirm subscription</a>
          </p>
          <p style="margin:0;font-size:12px;color:#666666;line-height:1.6;">If the button doesn't work, copy and paste this link:<br><a href="${confirmUrl}" style="color:#111111;">${confirmUrl}</a></p>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:11px;color:#999999;line-height:1.6;">If you did not request this, you can safely ignore this email.<br>&copy; George's Blog</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;

  await ses.send(
    new SendEmailCommand({
      Source: getSenderEmail(),
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: 'Confirm your subscription' },
        Body: {
          Text: { Data: plain },
          Html: { Data: html },
        },
      },
    }),
  );
}
