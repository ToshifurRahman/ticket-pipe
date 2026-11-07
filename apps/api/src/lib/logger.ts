import pino from 'pino';

import { nodeEnv } from './config.js';

export const logger = pino({
  transport:
    nodeEnv() !== 'production' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
