import nodemailer from 'nodemailer';

import { collectIssues, getConfig } from './config.js';

// The only module that sends mail (tests/mailer.guard.test.ts). Three drivers behind one
// interface: `brevo` (HTTPS API, production: Render free blocks SMTP ports), `smtp` (Mailpit
// locally and in e2e) and `memory` (vitest). MAIL_DRIVER picks one; unset means mail is off.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export type MailDriver = 'brevo' | 'smtp' | 'memory';

export function getMailDriver(): MailDriver | null {
  const value = getConfig().MAIL_DRIVER;
  if (!value) return null;
  return value;
}

export const isMailEnabled = () => getMailDriver() !== null;

/** Mail sent by the `memory` driver, newest last. For tests. */
export const sentMail: MailMessage[] = [];

function sender(): { email: string; name: string } {
  const email = getConfig().MAIL_FROM;
  if (!email) throw new Error('MAIL_FROM environment variable is required');
  return { email, name: getConfig().MAIL_FROM_NAME };
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10_000;

export function createBrevoMailer(fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send({ to, subject, text, html }) {
      const apiKey = getConfig().BREVO_API_KEY;
      if (!apiKey) throw new Error('BREVO_API_KEY environment variable is required');
      const from = sender();
      const response = await fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: from.email, name: from.name },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
      });
      // The body can echo the recipient, so only the status leaves this function.
      if (!response.ok) throw new Error(`Brevo responded ${response.status}`);
    },
  };
}

function createSmtpMailer(): Mailer {
  const transport = nodemailer.createTransport(getConfig().SMTP_URL);
  return {
    async send({ to, subject, text, html }) {
      const from = sender();
      await transport.sendMail({ from: `"${from.name}" <${from.email}>`, to, subject, text, html });
    },
  };
}

const memoryMailer: Mailer = {
  send(message) {
    sentMail.push(message);
    return Promise.resolve();
  },
};

let override: Mailer | null = null;
/** Tests only: replace the driver (pass null to restore). */
export function setMailerForTests(mailer: Mailer | null): void {
  override = mailer;
}

let cached: { driver: MailDriver; mailer: Mailer } | null = null;
export function getMailer(): Mailer | null {
  if (override) return override;
  const driver = getMailDriver();
  if (!driver) return null;
  if (cached?.driver !== driver) {
    cached = {
      driver,
      mailer:
        driver === 'brevo'
          ? createBrevoMailer()
          : driver === 'smtp'
            ? createSmtpMailer()
            : memoryMailer,
    };
  }
  return cached.mailer;
}

/** Startup check. In production only the Brevo driver is allowed, and it must be fully set up. */
export function assertMailConfigured(): void {
  const [message] = collectIssues(['MAIL_DRIVER', 'PUBLIC_SITE_URL', 'BREVO_API_KEY']);
  if (message) throw new Error(message);
  if (getMailDriver() !== null) sender();
}
