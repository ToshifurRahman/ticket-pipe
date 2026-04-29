import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './lib/logger.js';
import { ticketsRouter } from './routes/tickets.js';
import { healthRouter } from './routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/health', healthRouter);
app.use('/api/tickets', ticketsRouter);

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    logger.info({ port }, 'Server started');
  });
}

export { app, logger };
