import { Link, NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DEMO_NOTICE, LEGAL_DOCS, type LegalDocKey, type LegalParagraph } from '@/content/legal';

const TABS: { key: LegalDocKey; label: string }[] = [
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms' },
];

function Paragraph({ text }: { text: LegalParagraph }) {
  return (
    <p className="mb-2.5 max-w-[62ch] text-muted-foreground">
      {typeof text === 'string' ? (
        text
      ) : (
        <>
          {text.before}
          <a href={text.link.href} className="text-inherit">
            {text.link.label}
          </a>
          {text.after}
        </>
      )}
    </p>
  );
}

// One page for both documents: the tabs are links, so each document keeps its own URL.
export function LegalPage({ docKey }: { docKey: LegalDocKey }) {
  const doc = LEGAL_DOCS[docKey];

  return (
    <div className="mx-auto w-full max-w-190">
      <nav aria-label="Legal page" className="mb-7 flex gap-2">
        {TABS.map((tab) => (
          <Button key={tab.key} asChild variant="tb">
            <NavLink to={`/legal/${tab.key}`} className="text-foreground no-underline hover:no-underline">
              {tab.label}
            </NavLink>
          </Button>
        ))}
      </nav>
      <article className="animate-print-in-2 leading-[1.55]">
        <header>
          <p className="button-caps mb-2.5 text-xs text-muted-foreground">Legal · {doc.title}</p>
          <h1 className="text-[clamp(2.25rem,5vw,4rem)] leading-none font-bold tracking-[-0.035em] text-balance">
            {doc.title}
          </h1>
        </header>
        <p className="mt-3 mb-5 font-mono text-[0.8125rem] leading-[normal] text-muted-foreground">Last updated {doc.updated}</p>
        <p className="mb-5 text-[1.375rem] leading-[1.35] text-balance">{doc.intro}</p>
        <p role="note" className="mb-3 border border-dashed border-muted-foreground px-4 py-3 text-sm leading-[1.55] text-muted-foreground">
          {DEMO_NOTICE}
        </p>
        {doc.sections.map((section, i) => (
          <section key={section.heading} className="grid grid-cols-[2rem_1fr] gap-x-4 border-t py-6 md:grid-cols-[3rem_1fr]">
            <span aria-hidden className="pt-1.5 font-mono text-[0.8125rem] text-muted-foreground">
              {i + 1}
            </span>
            <div>
              <h2 className="mb-2.5 text-2xl leading-[1.15] font-bold tracking-[-0.02em]">{section.heading}</h2>
              {section.body.map((paragraph, j) => (
                <Paragraph key={j} text={paragraph} />
              ))}
            </div>
          </section>
        ))}
        <p className="mt-3">
          <Link to="/" className="text-inherit">
            Back to home
          </Link>
        </p>
      </article>
    </div>
  );
}
