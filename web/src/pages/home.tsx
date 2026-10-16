import { useEffect } from 'react';
import { Faq } from '@/components/landing/faq';
import { Features } from '@/components/landing/features';
import { Hero } from '@/components/landing/hero';
import { Pricing } from '@/components/landing/pricing';
import { brand } from '@/config/brand';

export function HomePage() {
  useEffect(() => {
    document.title = `${brand.name} · ${brand.tagline}`;
  }, []);

  return (
    <>
      <Hero />
      <Features />
      <Pricing />
      <Faq />
    </>
  );
}
