export type Feature = { n: string; label: string; body: string };
export type Tier = {
  name: string;
  blurb: string;
  price: string;
  cadence?: string;
  features: string[];
  cta: string;
  featured?: boolean;
};
export type Faq = { q: string; a: string };

export const FEATURES_HEADING = {
  label: 'Section A · How it works',
  title: 'Four stages, all on the record.',
  subtitle: 'The same four plies you just watched, in order.',
};

export const FEATURES: Feature[] = [
  { n: '01', label: 'Received', body: 'Your request is filed as a ticket with its own reference, the moment you send it.' },
  { n: '02', label: 'Triaged', body: 'It’s sorted by category and urgency, and you see both on the page.' },
  { n: '03', label: 'Drafted', body: 'A reply is written for your question, with notes the team keeps to themselves.' },
  {
    n: '04',
    label: 'Replied',
    body: 'The answer lands in the same thread. Anything that needs a person is put on hold for the team, never lost.',
  },
];

export const PRICING_HEADING = { label: 'Section B', title: 'Rates' };

export const TIERS: Tier[] = [
  {
    name: 'Starter',
    blurb: 'For a single inbox',
    price: 'Free',
    features: ['Triage on every ticket', 'Drafted replies', 'Live tracking page'],
    cta: 'Start free',
  },
  {
    name: 'Team',
    blurb: 'For a growing support desk',
    price: '$49',
    cadence: '/ month',
    features: ['Everything in Starter', 'Ops console with replay', 'Alerts for tickets needing attention'],
    cta: 'Start with Team',
    featured: true,
  },
  {
    name: 'Scale',
    blurb: 'For high-volume teams',
    price: 'Custom',
    features: ['Everything in Team', 'AI performance reporting', 'Full ticket history & audit'],
    cta: 'Ask us',
  },
];

export const FAQ_HEADING = { label: 'Section C', title: 'Questions' };

export const FAQS: Faq[] = [
  {
    q: 'Does a person ever see my ticket?',
    a: 'Yes. Every ticket is visible to the support team, and anything the AI can’t answer confidently is flagged for a person to follow up in the same thread.',
  },
  {
    q: 'How do I find my ticket again?',
    a: 'Keep your reference number. Paste it into “Track a ticket” at the top of any page. This browser also remembers the tickets you’ve submitted.',
  },
  {
    q: 'What happens if something goes wrong?',
    a: 'Your ticket is never lost. It’s marked On hold for the team, and the page updates as soon as it’s picked back up.',
  },
  {
    q: 'Is my message kept private?',
    a: 'Only you (with the reference) and the support team can see the thread. Internal notes never appear on your page.',
  },
  {
    q: 'Can I get the answer by email?',
    a: 'Yes. Once your ticket is filed, add your email on the ticket page and we’ll send the reply there too, after you confirm the address.',
  },
];
