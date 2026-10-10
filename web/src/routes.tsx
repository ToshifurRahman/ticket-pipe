import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { TicketSkeleton } from '@/components/ticket/ticket-states';
import { OpsLayout } from '@/layouts/ops-layout';
import { PublicLayout } from '@/layouts/public-layout';
import { HomePage } from '@/pages/home';
import { PrivacyPage, TermsPage } from '@/pages/legal';
import { NewTicketPage } from '@/pages/new-ticket';
import { NotFoundPage } from '@/pages/not-found';
import { OpsPage } from '@/pages/ops';

// The ticket page brings the socket.io client; load both only when a ticket is opened.
const TicketPage = lazy(() => import('@/pages/ticket').then((m) => ({ default: m.TicketPage })));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="new" element={<NewTicketPage />} />
        <Route
          path="t/:ref"
          element={
            <Suspense fallback={<TicketSkeleton />}>
              <TicketPage />
            </Suspense>
          }
        />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<OpsLayout />}>
        <Route path="ops" element={<OpsPage />} />
      </Route>
    </Routes>
  );
}
