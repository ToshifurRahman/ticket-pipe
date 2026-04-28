import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './lib/logger.js';
import { ticketsRouter } from './routes/tickets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/tickets', ticketsRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  logger.info({ port }, 'Server started');
});

export { app, logger };
