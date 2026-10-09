import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Stub } from './stub';

export function NotFoundPage() {
  return (
    <Stub title="Page not found">
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <div>
        <Button asChild>
          <Link to="/" className="text-primary-foreground no-underline hover:no-underline">
            Back to home
          </Link>
        </Button>
      </div>
    </Stub>
  );
}
