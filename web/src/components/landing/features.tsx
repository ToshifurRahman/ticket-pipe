import { FEATURES, FEATURES_HEADING } from '@/content/landing';

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24 py-16">
      <div className="mb-10 flex flex-col gap-2">
        <span className="label-caps text-xs text-muted-foreground">{FEATURES_HEADING.label}</span>
        <h2 id="features-title" className="text-3xl font-semibold tracking-tight text-balance">
          {FEATURES_HEADING.title}
        </h2>
        <p className="text-muted-foreground">{FEATURES_HEADING.subtitle}</p>
      </div>
      <ol className="divide-y divide-rule border-y border-rule">
        {FEATURES.map(({ n, label, body }) => (
          <li key={n} className="grid gap-1 py-5 sm:grid-cols-[4rem_10rem_1fr] sm:gap-6">
            <span aria-hidden className="font-mono text-sm text-muted-foreground">
              {n}
            </span>
            <h3 className="label-caps text-base">{label}</h3>
            <p className="text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
