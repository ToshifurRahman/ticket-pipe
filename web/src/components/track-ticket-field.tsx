import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidRef, normalizeRef, REF_EXAMPLE } from '@/lib/ticket-ref';
import { cn } from '@/lib/utils';

type TrackFormProps = {
  onDone?: () => void;
  autoFocus?: boolean;
  // In the header the hint floats under the field, so an error never moves the top rule.
  floatingHint?: boolean;
};

export function TrackForm({ onDone, autoFocus = false, floatingHint = false }: TrackFormProps) {
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
    <form onSubmit={submit} className={cn('flex flex-col gap-1.5', floatingHint && 'relative')} role="search">
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
        className="font-mono placeholder:font-sans"
      />
      {invalid && (
        <span
          id="track-hint"
          role="alert"
          className={cn(
            'text-xs text-destructive',
            floatingHint && 'absolute top-full right-0 z-10 mt-1 border border-destructive bg-background px-2 py-1.5'
          )}
        >
          Enter a reference like <span className="font-mono whitespace-nowrap">{REF_EXAMPLE}</span>
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
        <TrackForm floatingHint />
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
