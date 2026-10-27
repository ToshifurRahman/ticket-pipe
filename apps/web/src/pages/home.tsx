import { useEffect } from 'react';

import { brand } from '@/config/brand';
import { Faq, Hero, Pricing, Stages } from '@/features/landing';

export function HomePage() {
  useEffect(() => {
    document.title = `${brand.name} · ${brand.tagline}`;
  }, []);

  return (
    <>
      <Hero />
      <Stages />
      <div className="bg-background px-4 py-22">
        <div className="mx-auto flex max-w-(--content-width) flex-col gap-22">
          <Pricing />
          <Faq />
        </div>
      </div>
    </>
  );
}
