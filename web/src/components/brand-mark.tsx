import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

// The ply stack: a carbonless service set seen from the edge, four plies fanned one step
// apart. Received, Triaged, the live ply in form red, and Replied. The tile is always printed
// in the carbon theme (the `dark` class scopes the ply tokens to it), so the mark reads the
// same on paper; the light plies would vanish on a paper ground. web/public/favicon.svg is
// the same drawing in the carbon theme's literal values.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('dark flex size-(--mark-size) items-center justify-center border border-input bg-background', className)}>
      <svg viewBox="0 0 24 24" className="size-3/4">
        <rect x="2" y="3" width="17" height="3.5" className="fill-ply-received" />
        <rect x="3.5" y="8" width="17" height="3.5" className="fill-ply-triaged" />
        <rect x="5" y="13" width="17" height="3.5" className="fill-ply-drafted" />
        <rect x="6.5" y="18" width="17" height="3.5" className="fill-ply-replied-edge" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <span className="label-caps text-xl leading-none">{brand.name}</span>
    </span>
  );
}
