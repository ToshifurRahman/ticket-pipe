import { BellRing, FileText, Radio, UserCheck, type LucideIcon } from 'lucide-react';

export type Feature = { icon: LucideIcon; title: string; body: string };
export type Tier = {
  name: string;
  blurb: string;
  price: string;
  cadence?: string;
  features: string[];
  cta: string;
  popular?: boolean;
};
export type Faq = { q: string; a: string };

export const FEATURES_HEADING = {
  eyebrow: 'The pipeline',
  title: 'From inbox to answer, without the triage queue.',
  subtitle: 'Four things happen to every ticket, in order, in seconds.',
};

export const FEATURES: Feature[] = [
  {
    icon: BellRing,
    title: 'Instant triage',
    body: 'Category, priority and a one-line summary on every ticket — before anyone opens it.',
  },
  {
    icon: FileText,
    title: 'Drafted replies',
    body: 'A context-aware answer written for the customer, plus internal notes for your team.',
  },
  {
    icon: Radio,
    title: 'Live updates',
    body: 'Customers watch their ticket move from received to replied — no refresh, no “any update?” emails.',
  },
  {
    icon: UserCheck,
    title: 'Human handoff',
    body: 'Anything the AI can’t handle cleanly is flagged for your team and recovered in one click.',
  },
];

export const PRICING_NOTE = 'Illustrative tiers — this is a demo product.';

export const TIERS: Tier[] = [
  {
    name: 'Starter',
    blurb: 'For a single inbox',
    price: 'Free',
    features: ['Triage on every ticket', 'Drafted replies', 'Live tracking page'],
    cta: 'Try it',
  },
  {
    name: 'Team',
    blurb: 'For a growing support desk',
    price: '$49',
    cadence: '/ month',
    features: ['Everything in Starter', 'Ops console & replay', 'Alerts for tickets needing attention'],
    cta: 'Try it',
    popular: true,
  },
  {
    name: 'Scale',
    blurb: 'For high-volume teams',
    price: 'Custom',
    features: ['Everything in Team', 'AI performance reporting', 'Full ticket history & audit'],
    cta: 'Talk to us',
  },
];

export const FAQS: Faq[] = [
  {
    q: 'Does a person ever see my ticket?',
    a: 'Yes. Every ticket is visible to the support team, and anything the AI can’t answer confidently is flagged for a person to follow up in the same thread.',
  },
  {
    q: 'How do I find my ticket again?',
    a: 'Keep your reference number. Paste it into “Track a ticket” at the top of any page — this browser also remembers the tickets you’ve submitted.',
  },
  {
    q: 'What happens if something goes wrong?',
    a: 'Your ticket is never lost. If processing fails, the team is notified, and the thread updates live as soon as it’s picked back up.',
  },
  {
    q: 'Is my message kept private?',
    a: 'Only you (with the reference) and the support team can see the thread. Internal notes never appear on your page.',
  },
];
