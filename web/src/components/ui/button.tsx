import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Printed caps on square stock. Primary is inverted ink, never red: red is kept for what is
// live or urgent. States change in one step, like a stamp, never with a fade: a press sets the
// button down a pixel, and an outline button's rule goes heavy under the pointer. Disabled is a
// muted hairline outline (not ready yet), not a dimmed slab. Focus is the global ink outline
// (index.css), offset off the button.
const buttonVariants = cva(
  'label-caps inline-flex shrink-0 items-center justify-center gap-2 border border-transparent text-sm whitespace-nowrap active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:shadow-none disabled:border-input disabled:bg-transparent disabled:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/70',
        outline:
          'border-input bg-transparent text-foreground hover:border-foreground hover:bg-accent hover:shadow-[inset_0_0_0_var(--hair)_var(--foreground)] active:border-primary active:bg-primary active:text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:border-input active:border-foreground',
        ghost: 'text-foreground hover:border-border hover:bg-accent active:border-foreground',
      },
      size: {
        default: 'h-(--control-height) px-4',
        sm: 'h-(--control-height-sm) px-3 text-xs',
        icon: 'size-(--control-height)',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
