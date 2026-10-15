import nodemailer from 'nodemailer';

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
const DRIVERS: readonly MailDriver[] = ['brevo', 'smtp', 'memory'];

export function getMailDriver(): MailDriver | null {
  const value = process.env.MAIL_DRIVER;
  if (!value) return null;
  if (!DRIVERS.includes(value as MailDriver)) throw new Error(`MAIL_DRIVER must be one of ${DRIVERS.join(', ')}`);
  return value as MailDriver;
}

export const isMailEnabled = () => getMailDriver() !== null;

/** Mail sent by the `memory` driver, newest last. For tests. */
export const sentMail: MailMessage[] = [];

function sender(): { email: string; name: string } {
  const email = process.env.MAIL_FROM;
  if (!email) throw new Error('MAIL_FROM environment variable is required');
  return { email, name: process.env.MAIL_FROM_NAME ?? 'Relay' };
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10_000;

export function createBrevoMailer(fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send({ to, subject, text, html }) {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) throw new Error('BREVO_API_KEY environment variable is required');
      const from = sender();
      const response = await fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
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
  const transport = nodemailer.createTransport(process.env.SMTP_URL ?? 'smtp://localhost:1025');
  return {
    async send({ to, subject, text, html }) {
      const from = sender();
      await transport.sendMail({ from: `"${from.name}" <${from.email}>`, to, subject, text, html });
    },
  };
}

const memoryMailer: Mailer = {
  async send(message) {
    sentMail.push(message);
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
      mailer: driver === 'brevo' ? createBrevoMailer() : driver === 'smtp' ? createSmtpMailer() : memoryMailer,
    };
  }
  return cached.mailer;
}

/** Startup check. In production only the Brevo driver is allowed, and it must be fully set up. */
export function assertMailConfigured(): void {
  const driver = getMailDriver();
  if (process.env.NODE_ENV === 'production' && driver !== null && driver !== 'brevo') {
    throw new Error('MAIL_DRIVER must be brevo (or unset) in production');
  }
  if (driver === null) return;
  if (!process.env.PUBLIC_SITE_URL) throw new Error('PUBLIC_SITE_URL is required when MAIL_DRIVER is set');
  sender();
  if (driver === 'brevo' && !process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is required for the brevo driver');
}
