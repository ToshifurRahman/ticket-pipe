import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TicketSkeleton } from '@/components/ticket/ticket-states';
import { LEGAL_DOCS, type LegalDocKey } from '@/content/legal';
import { PublicLayout } from '@/layouts/public-layout';
import { HomePage } from '@/pages/home';
import { LegalPage } from '@/pages/legal';
import { NotFoundPage } from '@/pages/not-found';

// The submit page brings react-hook-form and zod; keeping them out of the main bundle keeps
// its evaluation off every other page's first load.
// The ticket page brings the socket.io client; load both only when a ticket is opened.
// The ops console brings the drawer, toasts and the whole staff UI; visitors never load it.
// The layout is lazy too: it holds the toaster and the sign-out control.
const OpsLayout = lazy(() => import('@/layouts/ops-layout').then((m) => ({ default: m.OpsLayout })));
const OpsPage = lazy(() => import('@/pages/ops').then((m) => ({ default: m.OpsPage })));
const NewTicketPage = lazy(() => import('@/pages/new-ticket').then((m) => ({ default: m.NewTicketPage })));
const ConfirmPage = lazy(() => import('@/pages/confirm').then((m) => ({ default: m.ConfirmPage })));
const TicketPage = lazy(() => import('@/pages/ticket').then((m) => ({ default: m.TicketPage })));

const LEGAL_DOC_KEYS = Object.keys(LEGAL_DOCS) as LegalDocKey[];

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="new"
          element={
            <Suspense fallback={<div className="min-h-screen" />}>
              <NewTicketPage />
            </Suspense>
          }
        />
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
        {/* One route and one old-URL redirect per document in the content file. A path param would
            send an unknown /legal/xyz to a 404 inside this layout, not the bare one below. */}
        {LEGAL_DOC_KEYS.map((key) => (
          <Route key={key} path={`legal/${key}`} element={<LegalPage docKey={key} />} />
        ))}
        {LEGAL_DOC_KEYS.map((key) => (
          <Route key={`${key}-old`} path={key} element={<Navigate to={`/legal/${key}`} replace />} />
        ))}
      </Route>
      <Route element={<PublicLayout bare />}>
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
