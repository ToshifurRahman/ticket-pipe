import { expect } from '@playwright/test';

// Mailpit (docker compose) catches the mail the e2e stack sends. Tests only ever look at mail
// addressed to their own unique recipient, so parallel tests never read each other's mail and
// nothing needs a mailbox-wide delete.

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export type CaughtMail = { subject: string; text: string };

export const uniqueAddress = () => `e2e+${crypto.randomUUID()}@example.test`;

async function fetchMail(address: string): Promise<CaughtMail[]> {
  const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
  const full = await Promise.all(
    messages.map(async ({ ID, Subject }) => {
      const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${ID}`)).json()) as { Text: string };
      return { subject: Subject, text: detail.Text };
    })
  );
  // Mailpit lists newest first; tests read in the order the mail was sent.
  return full.reverse();
}

/** Waits until `count` messages have reached `address` and returns them, oldest first. */
export async function waitForMail(address: string, count = 1): Promise<CaughtMail[]> {
  await expect.poll(async () => (await fetchMail(address)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(count);
  return fetchMail(address);
}

export const mailCount = async (address: string) => (await fetchMail(address)).length;

export function linkIn(mail: CaughtMail, pathPrefix: '/confirm/' | '/t/'): string {
  const match = new RegExp(`https?://[^\\s]+?(${pathPrefix}[\\w-]+)`).exec(mail.text);
  if (!match) throw new Error(`no ${pathPrefix} link in "${mail.subject}"`);
  return match[1];
}
