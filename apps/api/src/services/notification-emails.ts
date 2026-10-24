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
  value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!
  );

type Plies = 'none' | 'replied' | 'on-hold';

// Carbon Set colours from web/tokens/colors.json. The mail is a light page under a green header
// band so it reads in light clients, in a client's own dark inversion and on paper. It loads
// nothing from outside: no fonts, no images, no tracking.
const C = {
  hero: '#044F34',
  bone: '#E8F3EC',
  forest: '#08130F',
  rule: '#C9D6CF',
  mute: '#56645D',
  hold: '#56645D',
  received: ['#E4EEE8', '#08130F'],
  triaged: ['#34C98B', '#04140C'],
  drafted: ['#FF7A1A', '#1A0A00'],
  replied: ['#166534', '#E8F3EC'],
} as const;

const CAPS =
  "font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.08em";
const MONO = "font-family:'Courier Prime','Courier New',Courier,monospace";
const BODY = "font-family:'Public Sans',Arial,Helvetica,sans-serif";

const mark = [C.received[0], C.triaged[0], C.drafted[0], '#3FA766']
  .map(
    (color, i) =>
      `<tr><td height="5" style="padding:0 0 1px ${i * 3}px;font-size:0;line-height:0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="5" bgcolor="${color}" style="font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`
  )
  .join('');

function pliesRow(kind: Exclude<Plies, 'none'>): string {
  const labels = ['Received', 'Triaged', 'Drafted', kind === 'replied' ? 'Replied' : 'On hold'];
  const colors = [
    C.received,
    C.triaged,
    C.drafted,
    kind === 'replied' ? C.replied : [C.hold, C.bone],
  ];
  const cells = labels.map(
    (label, i) =>
      `<td width="25%" bgcolor="${colors[i][0]}" valign="top" style="padding:10px 8px;background:${colors[i][0]};color:${colors[i][1]}"><div style="${MONO};font-size:12px;line-height:16px">${i + 1}</div><div style="${CAPS};font-size:12px;line-height:16px;margin-top:6px">${label}</div></td>`
  );
  return `<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells.join('')}</tr></table></td></tr>`;
}

function build(
  subject: string,
  lines: string[],
  ctx: EmailContext,
  button: string,
  plies: Plies
): Built {
  const text = [...lines, '', `${button}: ${ctx.url}`, '', `— ${BRAND_NAME}`].join('\n');
  const paragraphs = lines
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="${BODY};font-size:16px;line-height:1.55;color:${C.forest};margin:0 0 14px">${escapeHtml(line)}</p>`
    )
    .join('');
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#ffffff"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(lines[0] ?? '')}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0 0">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">`,
    // header band
    `<tr><td bgcolor="${C.hero}" style="padding:18px 22px;background:${C.hero};color:${C.bone}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${mark}</table></td><td valign="middle" style="${CAPS};font-size:20px;letter-spacing:.1em;color:${C.bone}">${escapeHtml(BRAND_NAME)}</td></tr></table></td></tr>`,
    // printed-form header: kicker and subject, then the reference as the form number on its own
    // ruled row, so it never wraps mid-reference on a phone
    `<tr><td style="padding:0;border:1px solid ${C.rule};border-top:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `<td valign="top" style="padding:16px 22px"><div style="${CAPS};font-size:12px;color:${C.mute}">Service ticket · Customer copy</div><div style="${BODY};font-size:22px;line-height:1.2;font-weight:600;color:${C.forest};margin-top:6px">${escapeHtml(ctx.subject)}</div></td>`,
    '</tr>',
    `<tr><td style="padding:10px 22px;border-top:1px solid ${C.rule}"><span style="${CAPS};font-size:12px;color:${C.mute}">No.</span> <span style="${MONO};font-size:13px;color:${C.forest};padding-left:8px">${escapeHtml(ctx.referenceNumber)}</span></td></tr>`,
    '</table></td></tr>',
    plies === 'none' ? '' : pliesRow(plies),
    // body and button
    `<tr><td style="padding:24px 22px 8px">${paragraphs}`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px"><tr><td bgcolor="${C.forest}" style="background:${C.forest}"><a href="${escapeHtml(ctx.url)}" style="${CAPS};display:inline-block;padding:15px 24px;font-size:14px;line-height:18px;letter-spacing:.1em;color:${C.bone};text-decoration:none">${escapeHtml(button)}</a></td></tr></table></td></tr>`,
    `<tr><td style="padding:0 22px 28px;${BODY};font-size:13px;color:${C.mute}">— ${escapeHtml(BRAND_NAME)}</td></tr>`,
    '</table></td></tr></table></body></html>',
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
    'Confirm my email',
    'none'
  );
}

export function buildReplyReadyEmail(ctx: EmailContext): Built {
  return build(
    `Your reply is ready (${ctx.referenceNumber})`,
    [`Your reply to “${ctx.subject}” (${ctx.referenceNumber}) is ready.`],
    ctx,
    'View my reply',
    'replied'
  );
}

export function buildSnagEmail(ctx: EmailContext): Built {
  return build(
    `A snag on ${ctx.referenceNumber}`,
    [
      `We hit a snag while working on “${ctx.subject}” (${ctx.referenceNumber}) It’s on hold and flagged for the team.`,
      'If a reply follows, we’ll email you.',
    ],
    ctx,
    'View my ticket',
    'on-hold'
  );
}
