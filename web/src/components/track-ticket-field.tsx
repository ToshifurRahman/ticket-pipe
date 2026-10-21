import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { isValidRef, normalizeRef, REF_EXAMPLE } from '@/lib/ticket-ref';
import { cn } from '@/lib/utils';

type TrackFormProps = {
  onDone?: () => void;
  autoFocus?: boolean;
  // In the header the hint floats under the field, so an error never moves the top rule.
  floatingHint?: boolean;
  // The header's field: 200px wide (128 on a phone), padded like the demo's, not a full form field.
  compact?: boolean;
};

export function TrackForm({ onDone, autoFocus = false, floatingHint = false, compact = false }: TrackFormProps) {
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
        className={cn('font-mono placeholder:font-sans', compact && 'h-auto px-2.5 py-2 text-sm leading-[normal] placeholder:text-muted-foreground')}
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

// The header's Track field: always inline, 200px wide and 128px under the phone breakpoint.
export function TrackTicketField() {
  return (
    <div className="relative w-32 sm:w-50">
      <TrackForm floatingHint compact />
    </div>
  );
}
