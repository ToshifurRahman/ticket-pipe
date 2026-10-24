import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

// No shadow to lift it, so a floating box takes the strong rule instead of the hairline.
export function PopoverContent({ className, align = 'end', sideOffset = 8, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 w-80 max-w-[calc(100vw-2rem)] border border-input bg-popover p-4 text-popover-foreground outline-none', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
