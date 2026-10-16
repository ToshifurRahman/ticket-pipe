import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Printed caps on square stock. Primary is inverted ink, never red: red is kept for what is
// live or urgent. Focus is the global ink outline (index.css), offset off the button.
const buttonVariants = cva(
  'label-caps inline-flex shrink-0 items-center justify-center gap-2 border border-transparent text-sm whitespace-nowrap transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-(--opacity-disabled) [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75',
        outline: 'border-input bg-transparent text-foreground hover:border-foreground hover:bg-accent active:bg-secondary',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:border-input active:border-foreground',
        ghost: 'text-foreground hover:border-border hover:bg-accent active:border-input',
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
