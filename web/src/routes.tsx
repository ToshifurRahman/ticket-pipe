import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { TicketSkeleton } from '@/components/ticket/ticket-states';
import { PublicLayout } from '@/layouts/public-layout';
import { HomePage } from '@/pages/home';
import { PrivacyPage, TermsPage } from '@/pages/legal';
import { NewTicketPage } from '@/pages/new-ticket';
import { NotFoundPage } from '@/pages/not-found';

// The ticket page brings the socket.io client; load both only when a ticket is opened.
// The ops console brings the drawer, toasts and the whole staff UI; visitors never load it.
// The layout is lazy too: it holds the toaster and the sign-out control.
const OpsLayout = lazy(() => import('@/layouts/ops-layout').then((m) => ({ default: m.OpsLayout })));
const OpsPage = lazy(() => import('@/pages/ops').then((m) => ({ default: m.OpsPage })));
const ConfirmPage = lazy(() => import('@/pages/confirm').then((m) => ({ default: m.ConfirmPage })));
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
        <Route path="confirm/:token" element={
            <Suspense fallback={<TicketSkeleton />}>
              <ConfirmPage />
            </Suspense>
          }
        />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        element={
          <Suspense fallback={<div className="min-h-screen" />}>
            <OpsLayout />
          </Suspense>
        }
      >
        <Route
          path="ops"
          element={
            <Suspense fallback={<div className="mt-10 h-40 animate-pulse rounded-xl bg-muted" />}>
              <OpsPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
