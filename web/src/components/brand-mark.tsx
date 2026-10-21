import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

// The ply stack: a carbonless service set seen from the edge, four plies fanned one step
// apart: Received, Triaged, Drafted and Replied. Flat bars with no tile, as the demo draws it.
// web/public/favicon.svg is the same drawing on a ground, because a tab icon needs one.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 22" className={cn('block h-5.5 w-7 shrink-0', className)}>
      <rect x="0" y="0" width="20" height="5" className="fill-ply-received" />
      <rect x="2.5" y="5.5" width="20" height="5" className="fill-ply-triaged" />
      <rect x="5" y="11" width="20" height="5" className="fill-ply-drafted" />
      <rect x="7.5" y="16.5" width="20" height="5" className="fill-ply-replied-edge" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="button-caps text-xl leading-none">{brand.name}</span>
    </span>
  );
}
