import * as React from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full min-w-0 border border-input bg-background px-3 py-2 text-sm transition-colors duration-(--duration-fast) placeholder:text-muted-foreground hover:border-foreground focus-visible:border-foreground disabled:opacity-(--opacity-disabled) aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}
