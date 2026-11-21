import { withCors } from './lib/cors.js';
import { Router, handleRequest } from './lib/router.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import requestRoutes from './routes/requests.js';
import arrivalRoutes from './routes/arrivals.js';
import customerRoutes from './routes/customers.js';
import notificationRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import { billingRouter } from './routes/billing.js';
import { webhookRouter } from './routes/webhooks.js';

/**
 * Single dispatch table for the Next.js catch-all Route Handler. Every path
 * below maps 1:1 to the original Express mount point, so no API URL changes.
 */
const apiRouter = new Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'wishstock' });
});

// Webhook signatures are verified over the exact raw body, so this route is
// marked before the adapter performs any JSON parsing.
apiRouter.mount('/billing/webhook', webhookRouter);
apiRouter.mount('/auth', authRoutes);
apiRouter.mount('/billing', billingRouter);
apiRouter.mount('/products', productRoutes);
apiRouter.mount('/requests', requestRoutes);
apiRouter.mount('/arrivals', arrivalRoutes);
apiRouter.mount('/customers', customerRoutes);
apiRouter.mount('/notifications', notificationRoutes);
apiRouter.mount('/dashboard', dashboardRoutes);
apiRouter.mount('/settings', settingsRoutes);

export async function handleApiRequest(request: Request): Promise<Response> {
  const response = await handleRequest(apiRouter, request, {
    basePath: '/api',
    rawBodyPaths: [/^\/billing\/webhook\//],
  });
  return withCors(response, request);
}

export { corsPreflight } from './lib/cors.js';
