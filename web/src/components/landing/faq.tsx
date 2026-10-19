import { FAQ_HEADING, FAQS } from '@/content/landing';

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-3xl scroll-mt-24">
      <h2 id="faq-title" className="mb-8 text-center text-[clamp(2rem,4.4vw,3.5rem)] leading-none font-bold tracking-[-0.03em] text-balance">
        {FAQ_HEADING.title}
      </h2>
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
