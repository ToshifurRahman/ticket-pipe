import { cn } from '@/lib/utils';

type StampProps = React.ComponentProps<'span'> & {
  /** Which printed-caps style: labels are tighter, buttons wider. */
  caps?: 'label' | 'button';
};

// A rubber-stamp mark: printed caps, set at the shared tilt. Border width, padding, size and
// colour belong to the caller, since each stamp on the site is a different size and weight.
export function Stamp({ caps = 'button', className, ...props }: StampProps) {
  return <span className={cn(caps === 'label' ? 'label-caps' : 'button-caps', 'stamp-tilt inline-block', className)} {...props} />;
}
