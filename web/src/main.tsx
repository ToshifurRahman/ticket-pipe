// Public Sans for reading, Courier Prime for figures, Archivo Narrow for printed caps. Each
// stylesheet splits by unicode-range, so a Latin page only downloads the Latin files.
import '@fontsource-variable/public-sans/wght.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/archivo-narrow/700.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { createQueryClient } from '@/lib/query-client';
import { Analytics } from '@/components/analytics';
import { AppRoutes } from './routes';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Analytics />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
