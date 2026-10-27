// Hand-written response shapes. The web app never imports from ../src: the API's internal
// fields must not look public, and the packages stay independent. Each feature keeps its own
// shapes in features/<name>/types.ts; only the ones both tickets and ops use live here.

/** Body of a 400 from the API: `{ errors: { field: message } }`. */
export type FieldErrors = Record<string, string>;

export type TicketStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'needs_attention';

/** Shared by the public ticket view and the ops console. */
export type TicketPhaseStatus = 'pending' | 'processing' | 'completed' | 'failed';
