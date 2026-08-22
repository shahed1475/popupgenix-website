import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './auth/middleware.js';
import { createAuthRoutes } from './auth/authRoutes.js';
import { createProjectsRouter } from './resources/projects.js';
import { createCompaniesRouter } from './resources/companies.js';
import { createServicesRouter } from './resources/services.js';
import { createHomepageContentRouter } from './resources/homepageContent.js';
import { createContactSubmissionsRouter } from './resources/contactSubmissions.js';
import { createQuoteRequestsRouter } from './resources/quoteRequests.js';
import { createInvoicesRouter } from './resources/invoices.js';
import { createFeedbackRouter } from './resources/feedback.js';
import { errorHandler } from './lib/httpError.js';
import { ConsoleEmailSender } from './email/ConsoleEmailSender.js';

export function createApp(
  pool: Pool,
  jwtSecret: string,
  jwtExpiresIn: string,
  // Defaults to 'production' (email-verification / password-reset routes disabled) so a caller
  // that forgets to pass this fails closed rather than exposing dev-only routes.
  nodeEnv: string = 'production'
): Express {
  const auth = createAuthMiddleware(jwtSecret, pool);
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRoutes(pool, auth, jwtSecret, jwtExpiresIn, new ConsoleEmailSender(), nodeEnv));
  app.use('/api/projects', createProjectsRouter(pool, auth));
  app.use('/api/companies', createCompaniesRouter(pool, auth));
  app.use('/api/services', createServicesRouter(pool, auth));
  app.use('/api/homepage-content', createHomepageContentRouter(pool, auth));
  app.use('/api/contact-submissions', createContactSubmissionsRouter(pool, auth));
  app.use('/api/quote-requests', createQuoteRequestsRouter(pool, auth));
  app.use('/api/invoices', createInvoicesRouter(pool, auth));
  app.use('/api/testimonials', createFeedbackRouter(pool, auth));

  app.use(errorHandler);
  return app;
}
