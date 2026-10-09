import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const target = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button variant="outline" size="icon" onClick={toggle} aria-label={`Switch to ${target} theme`}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
