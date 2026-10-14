import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

// Sonner takes its colours from CSS variables, so the toasts follow the app's tokens.
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
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
    />
  );
}
