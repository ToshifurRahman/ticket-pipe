import type { ReactNode } from 'react';

// Placeholder body for routes that later stories fill in.
export function Stub({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </section>
  );
}
