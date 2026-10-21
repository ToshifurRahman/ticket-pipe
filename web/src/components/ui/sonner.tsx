import { Toaster as Sonner } from 'sonner';

// Sonner takes its colours from CSS variables, so the toasts follow the app's tokens. Flat and
// square like the rest of the form: a card with an orange rule, as the demo's toast has it,
// and red only for errors.
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      duration={8000}
      offset={16}
      style={
        {
          '--normal-bg': 'var(--card)',
          '--normal-text': 'var(--card-foreground)',
          '--normal-border': 'var(--priority-high)',
          '--border-radius': '0px',
        } as React.CSSProperties
      }
      toastOptions={{
        style: { boxShadow: 'none' },
        classNames: {
          toast: 'font-sans animate-print-toast motion-reduce:animate-none',
          actionButton:
            'button-caps! rounded-none! border! border-border! bg-transparent! px-3.5! py-1.5! text-xs! text-foreground! hover:border-foreground!',
          error: 'border-destructive! [&_[data-icon]]:text-destructive',
          warning: '[&_[data-icon]]:text-priority-high',
          success: '[&_[data-icon]]:text-ply-triaged',
        },
      }}
    />
  );
}
