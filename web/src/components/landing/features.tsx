import { FEATURES, FEATURES_HEADING } from '@/content/landing';

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24 py-16">
      <div className="mb-10 flex flex-col gap-2">
        <span className="font-mono text-xs tracking-widest text-primary uppercase">{FEATURES_HEADING.eyebrow}</span>
        <h2 id="features-title" className="text-3xl font-semibold tracking-tight text-balance">
          {FEATURES_HEADING.title}
        </h2>
        <p className="text-muted-foreground">{FEATURES_HEADING.subtitle}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-5">
            <div className="flex items-center justify-between">
              <Icon className="size-5 text-primary" aria-hidden />
              <span aria-hidden className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
