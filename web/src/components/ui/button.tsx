import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Printed caps on square stock, as the Relay Full Demo draws them. Default is the solid slab
// (.btn); solid is ink on the page ground (.btn.solid); outline is a rule in the text colour that goes heavy under the pointer (.btn.line);
// tb is the small text button with a hairline rule (.tb). States change in one step, like a
// stamp, never with a fade: a press sets the button down a pixel. Disabled is the same button
// at 45% (not ready yet). Focus is the global ink outline (index.css), offset off the button.
const buttonVariants = cva(
  'font-label inline-flex shrink-0 items-center leading-[normal] justify-center gap-2 border border-transparent text-sm font-bold tracking-(--tracking-button) whitespace-nowrap uppercase active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        solid: 'bg-foreground text-background',
        outline:
          'border-current bg-transparent text-foreground hover:shadow-[inset_0_0_0_var(--hair)_currentColor]',
        tb: 'border-border bg-transparent text-foreground hover:border-foreground hover:shadow-[inset_0_0_0_var(--hair)_var(--foreground)] aria-pressed:border-foreground aria-pressed:bg-card aria-selected:border-foreground aria-selected:bg-card aria-[current=page]:border-foreground aria-[current=page]:bg-card',
        ghost: 'text-foreground hover:border-border active:border-foreground',
      },
      size: {
        default: 'h-(--control-height) px-6',
        sm: 'h-(--control-height-sm) px-4.5',
        icon: 'size-(--control-height)',
      },
    },
    compoundVariants: [
      { variant: 'tb', class: 'h-auto px-3.5 py-1.5 text-xs tracking-(--tracking-label)' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
