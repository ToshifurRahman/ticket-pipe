import { useEffect } from 'react';
import { Faq } from '@/components/landing/faq';
import { Hero } from '@/components/landing/hero';
import { Pricing } from '@/components/landing/pricing';
import { Stages } from '@/components/landing/stages';
import { brand } from '@/config/brand';

export function HomePage() {
  useEffect(() => {
    document.title = `${brand.name} · ${brand.tagline}`;
  }, []);

  return (
    <>
      <Hero />
      <Stages />
      <div className="bg-background px-4 py-22 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-22">
          <Pricing />
          <Faq />
        </div>
      </div>
    </>
  );
}
