import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

// Sonner takes its colours from CSS variables, so the toasts follow the app's tokens. Flat and
// square like the rest of the form: a strong rule instead of a shadow, red only for errors
// and warnings.
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--input)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        style: { boxShadow: 'none' },
        classNames: {
          toast: 'font-sans',
          error: 'border-destructive! [&_[data-icon]]:text-destructive',
          warning: 'border-warning! [&_[data-icon]]:text-warning',
          success: '[&_[data-icon]]:text-success',
        },
      }}
    />
  );
}
