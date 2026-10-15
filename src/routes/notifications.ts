import { Hono } from 'hono';
import { confirm, preview } from '../controllers/notifications.js';

export const notificationsRouter = new Hono();

// The preview is a read-only GET (link scanners may load it); only the POST changes anything.
notificationsRouter.get('/confirm/:token', ...preview);
notificationsRouter.post('/confirm', ...confirm);
