import * as React from 'react';
import { cn } from '@/lib/utils';

// A ruled field on the form. What the visitor types stays in the reading face.
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-(--control-height) w-full min-w-0 border border-input bg-transparent px-3 text-base placeholder:text-muted-foreground/75 hover:border-foreground focus-visible:border-foreground disabled:opacity-(--opacity-disabled) aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}
