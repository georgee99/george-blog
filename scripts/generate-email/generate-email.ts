/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
function flagValue(name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
}

const subject = flagValue('--subject') || "New post on George's Blog";
const slug = flagValue('--slug') || 'your-post-slug';
const author = flagValue('--author') || 'George';
const bodyArg = flagValue('--body');
const bodyTemplate = bodyArg || `Hey,\n\nI just published a new post: https://georgeelz.blog/blog/${slug}\n\n${author}`;
const htmlArg = flagValue('--html');
const useDefaultHtml = args.includes('--use-default-html');

let html: string | undefined = undefined;
if (htmlArg) html = htmlArg;
if (useDefaultHtml && !html) {
  html = [
    '<!doctype html>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width,initial-scale=1" />',
    `    <title>${subject}</title>`,
    '  </head>',
    '  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">',
    '    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:40px 16px;">',
    '      <table width="560" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;">',
    '        <tr><td style="padding:32px 32px 0;border-bottom:2px solid #111111;">',
    '          <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#111111;">George\'s Blog</p>',
    `          <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#111111;line-height:1.3;">${subject}</h1>`,
    '        </td></tr>',
    '        <tr><td style="padding:0;">',
    '          <img src="https://georgeelz.blog/meow/M7-560.webp" srcset="https://georgeelz.blog/meow/M7-320.webp 320w, https://georgeelz.blog/meow/M7-560.webp 560w, https://georgeelz.blog/meow/M7-1120.webp 1120w" sizes="(max-width:480px) 320px, 560px" alt="" width="560" height="220" style="display:block;width:100%;max-width:560px;height:auto;object-fit:cover;" />',
    '        </td></tr>',
    '        <tr><td style="padding:32px;color:#111111;">',
    '          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello important person,</p>',
    `          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;">I just published a new post, come check it out</p>`,
    `          <p style="margin:0 0 28px;">`,
    `            <a href="https://georgeelz.blog/blog/${slug}" style="display:inline-block;padding:12px 24px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;">Read it here</a>`,
    '          </p>',
    `          <p style="margin:0;font-size:13px;color:#666666;">Or visit: <a href="https://georgeelz.blog/blog/${slug}" style="color:#111111;">georgeelz.blog/blog/${slug}</a></p>`,
    '        </td></tr>',
    '        <tr><td style="padding:20px 32px;border-top:1px solid #e5e5e5;">',
    `          <p style="margin:0;font-size:11px;color:#999999;line-height:1.6;">Thanks, ${author}<br>&copy; George's Blog</p>`,
    '        </td></tr>',
    '      </table>',
    '    </td></tr></table>',
    '  </body>',
    '</html>',
  ].join('\n');
}

const payload: any = { subject, body: bodyTemplate };
if (html) payload.html = html;
const out = JSON.stringify(payload, null, 2);

const outPath = path.join(__dirname, 'email-test.json');
try {
  fs.writeFileSync(outPath, out, { encoding: 'utf8' });
  console.log(out);
  console.log(`\nSaved test JSON to: ${outPath}`);
  console.log('Paste the JSON into the AWS Lambda Test event body.');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to write file:', err);
  process.exit(1);
}
