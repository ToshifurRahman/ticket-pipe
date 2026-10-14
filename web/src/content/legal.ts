import { brand } from '@/config/brand';

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

// Keep these pages true:
//  - Story 6.9 adds an email field: update "What we collect" and "What we don't" below.
//  - The company list names the real providers (src/lib/llm-client.ts, Render, Neon, Upstash,
//    AWS, Cloudflare). Change a provider, change the list.
//  - RETENTION_DAYS in src/services/ticket-retention.ts is the number promised here.
export const RETENTION_DAYS_TEXT = '30 days';

export const DEMO_NOTICE = `${brand.name} is a portfolio demo, not a real service. These pages are a plain-language mock of what a real one would say.`;

export const PRIVACY: LegalDoc = {
  title: 'Privacy',
  updated: 'October 2026',
  intro: `Short version: you type a ticket, an AI reads it and writes a reply, and we delete it after ${RETENTION_DAYS_TEXT}.`,
  sections: [
    {
      heading: 'What we collect',
      body: [
        'The subject and description you put in a ticket, and nothing else you type.',
        'We also keep the ticket’s progress (received, triaged, drafted, replied) and the AI’s answer.',
      ],
    },
    {
      heading: 'What we don’t collect',
      body: [
        'No accounts, no passwords and no email address. Anyone with a ticket’s reference can open it, so keep the reference to yourself.',
        'No advertising or tracking cookies.',
      ],
    },
    {
      heading: 'Who handles your ticket',
      body: [
        'Your ticket text is sent to AI providers (Groq, and Google as a backup) through Portkey, so they can sort it and draft a reply.',
        'Cloudflare checks that you’re not a bot (Turnstile) and counts visits without cookies (Web Analytics). The site runs on Render, Neon (database), Upstash (cache) and AWS (queue and staff alerts).',
        'These companies handle data under their own terms and may keep their own logs. Please don’t send anything sensitive.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [`Tickets, replies and their history are deleted ${RETENTION_DAYS_TEXT} after you send them. We may also wipe the demo sooner.`],
    },
    {
      heading: 'Stored in your browser',
      body: [
        'Your light or dark choice, and the last few ticket references so you can find them again. That stays on your device and you can clear it any time.',
      ],
    },
    {
      heading: 'Visit counts',
      body: [
        'Cloudflare Web Analytics counts page views. It sets no cookies and doesn’t follow you from site to site.',
      ],
    },
    {
      heading: 'Questions',
      body: [`Open an issue on the project’s GitHub page: ${brand.repoUrl}/issues`],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms',
  updated: 'October 2026',
  intro: 'Be kind, don’t break it, and don’t expect it to last.',
  sections: [
    {
      heading: 'It’s a demo',
      body: [
        `${brand.name} is a portfolio project. There’s no paid plan behind the pricing page, no support team and no uptime promise.`,
      ],
    },
    {
      heading: 'AI can be wrong',
      body: ['Replies are written by an AI. They may be inaccurate, so don’t act on them as advice.'],
    },
    {
      heading: 'What to send',
      body: [
        'Test tickets only. Please don’t submit personal, confidential or sensitive information.',
        'Don’t use the site to attack it, spam it or send anything unlawful.',
      ],
    },
    {
      heading: 'Changes and shutdown',
      body: ['We may change, reset or shut the demo down at any time, without notice.'],
    },
    {
      heading: 'No warranty',
      body: ['It’s provided as is. Use it at your own risk.'],
    },
    {
      heading: 'Privacy',
      body: ['What happens to your data is on the Privacy page.'],
    },
  ],
};
