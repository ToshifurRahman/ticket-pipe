import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/lib/utils';

// A field label printed on the form, in caps.
export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('label-caps flex items-center gap-2 text-sm leading-none select-none', className)}
      {...props}
    />
  );
}
