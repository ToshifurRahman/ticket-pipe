import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

// A panel on the right. Radix supplies the focus trap, Esc, scroll lock and aria wiring; Esc
// and the overlay both call `onOpenChange(false)`. It prints in as the demo's drawer does (three
// hard steps, none under reduced motion) and leaves at once: Carbon Set has no other motion.
export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/(--opacity-overlay)" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-(--form-rule) bg-card outline-none data-[state=open]:animate-print-in-1 motion-reduce:animate-none sm:max-w-140',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="tb" className="absolute top-3.5 right-3.5">
            Close
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
