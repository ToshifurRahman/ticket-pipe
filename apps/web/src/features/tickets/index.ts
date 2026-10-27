// Public API of the tickets feature: only what other folders import.

export {
  confirmNotification,
  getTicketByRef,
  notificationQueryKey,
  previewConfirmation,
  ticketQueryKey,
} from './api';
export { OfficeUse } from './components/office-use';
export { PlyRow } from './components/ply-row';
export { RecentTickets } from './components/recent-tickets';
export { TicketClosed } from './components/ticket-closed';
export { TicketForm } from './components/ticket-form';
export { TicketLoadError, TicketNotFound, TicketSkeleton } from './components/ticket-states';
export { TicketSuccess } from './components/ticket-success';
export { ON_HOLD_MESSAGE, TicketThread } from './components/ticket-thread';
export { TrackTicketField } from './components/track-ticket-field';
export { useRecentTickets } from './lib/recent-tickets';
export { isValidRef, normalizeRef } from './lib/ticket-ref';
export type { Ply, SupportSide } from './lib/ticket-thread';
export { supportSide, ticketPlies } from './lib/ticket-thread';
export type { TicketDetail } from './types';
