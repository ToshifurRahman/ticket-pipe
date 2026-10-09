import { useParams } from 'react-router-dom';
import { Stub } from './stub';

export function TicketPage() {
  const { ref } = useParams();
  return (
    <Stub title="Ticket">
      <p className="font-mono text-sm text-muted-foreground">{ref}</p>
    </Stub>
  );
}
