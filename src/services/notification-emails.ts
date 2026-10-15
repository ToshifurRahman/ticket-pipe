import type { MailMessage } from '../lib/mailer.js';

// The words in customer emails (story 6.9). They carry the subject, the reference and a link,
// never the description or the AI's reply, so Brevo only ever sees what the privacy page says.
// Keep BRAND_NAME in step with web/src/config/brand.ts.
export const BRAND_NAME = 'Relay';

export interface EmailContext {
  subject: string;
  referenceNumber: string;
  url: string;
}

type Built = Omit<MailMessage, 'to'>;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function build(subject: string, lines: string[], ctx: EmailContext, button: string): Built {
  const text = [...lines, '', `${button}: ${ctx.url}`, '', `— ${BRAND_NAME}`].join('\n');
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1c1b22;max-width:520px;margin:0 auto;padding:24px">',
    ...lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '')),
    `<p><a href="${escapeHtml(ctx.url)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(button)}</a></p>`,
    `<p style="color:#6b6978;font-size:13px">— ${escapeHtml(BRAND_NAME)}</p>`,
    '</body></html>',
  ].join('');
  return { subject, text, html };
}

export function buildConfirmEmail(ctx: EmailContext): Built {
  return build(
    `Confirm your email for ${ctx.referenceNumber}`,
    [
      `You asked ${BRAND_NAME} to email you about your ticket “${ctx.subject}” (${ctx.referenceNumber}).`,
      'Confirm to get updates. The link works for 24 hours. If this wasn’t you, ignore this email and nothing will be sent.',
    ],
    ctx,
    'Confirm my email'
  );
}

export function buildReplyReadyEmail(ctx: EmailContext): Built {
  return build(
    `Your reply is ready (${ctx.referenceNumber})`,
    [`Your reply to “${ctx.subject}” (${ctx.referenceNumber}) is ready.`],
    ctx,
    'View my reply'
  );
}

export function buildSnagEmail(ctx: EmailContext): Built {
  return build(
    `We’re looking into ${ctx.referenceNumber}`,
    [
      `We hit a snag while working on “${ctx.subject}” (${ctx.referenceNumber}) and we’re looking into it.`,
      'You’ll get one more email when your reply is ready.',
    ],
    ctx,
    'View my ticket'
  );
}
