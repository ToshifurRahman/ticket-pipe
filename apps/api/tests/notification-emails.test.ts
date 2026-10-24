/**
 * Story 6.17 — the customer mails in the Carbon Set form. The words and the links stay as 6.9 set
 * them; the HTML adds the form header and the ply strip and makes no outside requests.
 */
import { describe, it, expect } from 'vitest';
import {
  buildConfirmEmail,
  buildReplyReadyEmail,
  buildSnagEmail,
} from '../src/services/notification-emails.js';

const ctx = {
  subject: 'Export broken',
  referenceNumber: 'TICK-1760000000000-7A4D2C9E',
  url: 'https://relay.test/t/TICK-1760000000000-7A4D2C9E',
};
const confirmCtx = { ...ctx, url: 'https://relay.test/confirm/abc-123' };

const all = [
  ['confirm', buildConfirmEmail(confirmCtx), confirmCtx.url],
  ['reply ready', buildReplyReadyEmail(ctx), ctx.url],
  ['snag', buildSnagEmail(ctx), ctx.url],
] as const;

describe('customer emails', () => {
  it.each(all)(
    '%s: the button points at the link and the reference is the form number',
    (_name, mail, url) => {
      expect(mail.html).toContain(`href="${url}"`);
      expect(mail.html).toContain(ctx.referenceNumber);
      expect(mail.text).toContain(url);
    }
  );

  it.each(all)('%s: makes no outside requests', (_name, mail, url) => {
    expect(mail.html).not.toMatch(/<link|<img|<script|url\(|@import/i);
    expect([...mail.html.matchAll(/https?:\/\/[^"'\s<)]+/g)].map((m) => m[0])).toEqual([url]);
  });

  it('escapes a hostile subject everywhere in the HTML', () => {
    const mail = buildReplyReadyEmail({ ...ctx, subject: '<script>x</script>&"\'' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;x&lt;/script&gt;&amp;&quot;&#39;');
  });

  it('shows the four plies on a reply, ON HOLD on a snag, and no strip on the confirmation', () => {
    expect(buildReplyReadyEmail(ctx).html).toContain('Replied');
    expect(buildReplyReadyEmail(ctx).html).not.toContain('On hold');
    expect(buildSnagEmail(ctx).html).toContain('On hold');
    expect(buildSnagEmail(ctx).html).not.toContain('Replied');
    const confirm = buildConfirmEmail(confirmCtx).html;
    for (const label of ['Received', 'Triaged', 'Drafted', 'Replied', 'On hold'])
      expect(confirm).not.toContain(label);
  });

  it('keeps the subjects and the plain-text bodies word for word', () => {
    expect(buildConfirmEmail(confirmCtx).subject).toBe(
      'Confirm your email for TICK-1760000000000-7A4D2C9E'
    );
    expect(buildConfirmEmail(confirmCtx).text).toBe(
      [
        'You asked Relay to email you about your ticket “Export broken” (TICK-1760000000000-7A4D2C9E).',
        'Confirm to get updates. The link works for 24 hours. If this wasn’t you, ignore this email and nothing will be sent.',
        '',
        'Confirm my email: https://relay.test/confirm/abc-123',
        '',
        '— Relay',
      ].join('\n')
    );
    expect(buildReplyReadyEmail(ctx).subject).toBe(
      'Your reply is ready (TICK-1760000000000-7A4D2C9E)'
    );
    expect(buildReplyReadyEmail(ctx).text).toBe(
      [
        'Your reply to “Export broken” (TICK-1760000000000-7A4D2C9E) is ready.',
        '',
        `View my reply: ${ctx.url}`,
        '',
        '— Relay',
      ].join('\n')
    );
    expect(buildSnagEmail(ctx).subject).toBe('A snag on TICK-1760000000000-7A4D2C9E');
    expect(buildSnagEmail(ctx).text).toBe(
      [
        'We hit a snag while working on “Export broken” (TICK-1760000000000-7A4D2C9E) It’s on hold and flagged for the team.',
        'If a reply follows, we’ll email you.',
        '',
        `View my ticket: ${ctx.url}`,
        '',
        '— Relay',
      ].join('\n')
    );
  });
});
