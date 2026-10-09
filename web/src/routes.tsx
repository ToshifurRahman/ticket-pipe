import { Route, Routes } from 'react-router-dom';
import { OpsLayout } from '@/layouts/ops-layout';
import { PublicLayout } from '@/layouts/public-layout';
import { HomePage } from '@/pages/home';
import { PrivacyPage, TermsPage } from '@/pages/legal';
import { NewTicketPage } from '@/pages/new-ticket';
import { NotFoundPage } from '@/pages/not-found';
import { OpsPage } from '@/pages/ops';
import { TicketPage } from '@/pages/ticket';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="new" element={<NewTicketPage />} />
        <Route path="t/:ref" element={<TicketPage />} />
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
