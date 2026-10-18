import { FAQ_HEADING, FAQS } from '@/content/landing';

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-3xl scroll-mt-24 py-16">
      <div className="mb-8 flex flex-col gap-2">
        <span className="label-caps text-xs text-muted-foreground">{FAQ_HEADING.label}</span>
        <h2 id="faq-title" className="text-3xl font-semibold tracking-tight">
          {FAQ_HEADING.title}
        </h2>
      </div>
      <div className="divide-y divide-rule border-y border-rule">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden className="font-mono text-muted-foreground group-open:hidden">
                +
              </span>
              <span aria-hidden className="hidden font-mono text-muted-foreground group-open:inline">
                -
              </span>
            </summary>
            <p className="pb-4 text-base text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
