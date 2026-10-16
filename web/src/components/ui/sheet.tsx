import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

// A panel on the right. Radix supplies the focus trap, Esc, scroll lock and aria wiring; Esc
// and the overlay both call `onOpenChange(false)`. It lands with the ply stamp (two hard
// frames, instant under reduced motion) and leaves at once: Carbon Set has no other motion.
export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/(--opacity-overlay) data-[state=open]:animate-stamp" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border border-input bg-background outline-none data-[state=open]:animate-stamp sm:max-w-2xl',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close" className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
            <X />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
