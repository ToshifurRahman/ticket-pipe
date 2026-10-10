import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidRef, normalizeRef, REF_EXAMPLE } from '@/lib/ticket-ref';

export function TrackForm({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidRef(value)) {
      setInvalid(true);
      return;
    }
    const ref = normalizeRef(value);
    setValue('');
    setInvalid(false);
    onDone?.();
    navigate(`/t/${ref}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" role="search">
      <Input
        aria-label="Ticket reference"
        placeholder="Track a ticket"
        value={value}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'track-hint' : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        className="h-10 font-mono text-[13px]"
      />
      {invalid && (
        <span id="track-hint" role="alert" className="text-xs text-destructive">
          Enter a reference like {REF_EXAMPLE}
        </span>
      )}
    </form>
  );
}

// Wide screens get the inline field; below 640px it collapses to an icon + popover so the
// header never wraps.
export function TrackTicketField() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="relative hidden w-56 sm:block">
        <TrackForm />
      </div>
      <div className="sm:hidden">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Track a ticket">
              <Search />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <TrackForm autoFocus onDone={() => setOpen(false)} />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
