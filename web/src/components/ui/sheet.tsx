import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

// A panel that slides in from the right. Radix supplies the focus trap, Esc, scroll lock and
// aria wiring; Esc and the overlay both call `onOpenChange(false)`.
export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/(--opacity-overlay) data-[state=closed]:animate-[overlay-out_var(--duration-fast)_ease-in] data-[state=open]:animate-[overlay-in_var(--duration-fast)_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border border-input bg-background outline-none sm:max-w-2xl',
          'data-[state=closed]:animate-[sheet-out_var(--duration-fast)_ease-in] data-[state=open]:animate-[sheet-in_var(--duration-fast)_ease-out]',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 border border-transparent p-1.5 text-muted-foreground transition-colors duration-(--duration-fast) hover:border-border hover:text-foreground"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
