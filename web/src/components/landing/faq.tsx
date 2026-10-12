import { ChevronDown } from 'lucide-react';
import { FAQS } from '@/content/landing';

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-3xl scroll-mt-24 py-16">
      <h2 id="faq-title" className="mb-8 text-3xl font-semibold tracking-tight">
        Questions
      </h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-card/70">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-4 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
