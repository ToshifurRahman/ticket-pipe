import * as React from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-37.5 w-full min-w-0 border border-input bg-transparent px-3 py-2.75 text-base leading-normal placeholder:text-muted-foreground/75 hover:border-foreground focus-visible:border-foreground disabled:opacity-(--opacity-disabled) aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}
