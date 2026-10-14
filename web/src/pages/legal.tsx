import { Link } from 'react-router-dom';
import { DEMO_NOTICE, PRIVACY, TERMS, type LegalDoc } from '@/content/legal';

function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <article className="mx-auto flex max-w-prose flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {doc.updated}</p>
        <p className="text-lg text-foreground">{doc.intro}</p>
        <p role="note" className="rounded-lg border bg-muted px-4 py-3 text-sm text-foreground">
          {DEMO_NOTICE}
        </p>
      </header>
      {doc.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <p className="text-sm text-muted-foreground">
        <Link to="/">Back to home</Link>
      </p>
    </article>
  );
}

export function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />;
}

export function TermsPage() {
  return <LegalPage doc={TERMS} />;
}
