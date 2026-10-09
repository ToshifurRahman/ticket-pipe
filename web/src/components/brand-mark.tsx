import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

// The pulse glyph from the design concept, on a --primary tile.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center rounded-[10px] bg-primary shadow-[0_0_24px] shadow-primary/60', className)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
        <path d="M7 12h3l2-4 2 8 2-4h1" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <span className="text-[22px] font-semibold tracking-tight">{brand.name}</span>
    </span>
  );
}
