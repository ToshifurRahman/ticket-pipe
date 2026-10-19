import { Link } from 'react-router-dom';
import { FormFoot } from '@/components/form/form-panel';
import { Button } from '@/components/ui/button';

// Once the reply is in, the thread is closed; the only way on is a new ticket.
export function TicketClosed() {
  return (
    <FormFoot className="flex-col items-start gap-3 px-4 py-5 sm:px-5.5">
      <p className="text-sm text-muted-foreground">This conversation is closed. Need more help? Open a new ticket.</p>
      <Button asChild size="sm">
        <Link to="/new" className="no-underline">
          Open a new ticket
        </Link>
      </Button>
    </FormFoot>
  );
}
