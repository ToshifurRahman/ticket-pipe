import type { ComponentProps, ElementType } from 'react';
import { cn } from '@/lib/utils';

type PanelProps<T extends ElementType> = { as?: T; enter?: boolean } & Omit<ComponentProps<T>, 'as'>;

/**
 * One service form: a single ruled sheet that header, plies, thread and footers are printed
 * on. With `enter` the sheet prints in on mount (after the page heading, if it has one).
 */
export function FormPanel<T extends ElementType = 'section'>({ as, enter = false, className, ...props }: PanelProps<T>) {
  const Tag: ElementType = as ?? 'section';
  return (
    <Tag
      className={cn('ruled form-surface min-w-0 bg-form text-foreground', enter && 'animate-print-in-2', className)}
      {...props}
    />
  );
}

/** The padded body of a form that is not a ply stack: fields, notes, buttons. */
export function FormBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-5 p-4 sm:p-5.5', className)} {...props} />;
}

/** A ruled strip along the bottom of the form. */
export function FormFoot({ className, ...props }: ComponentProps<'footer'>) {
  return <footer className={cn('flex flex-wrap items-center gap-3 border-t border-rule px-4 py-3 sm:px-5.5', className)} {...props} />;
}
