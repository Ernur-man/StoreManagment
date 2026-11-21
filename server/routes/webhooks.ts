import { Router } from '../lib/router.js';
import { Prisma } from '@prisma/client';
import { PAYMENT_PROVIDERS, type PaymentProviderName } from '../lib/constants.js';
import { asyncRoute } from '../lib/http.js';
import { applyPaymentEvent } from '../services/billing.js';
import { PaymentVerificationError, normalizeWebhook } from '../services/payments.js';

/**
 * Provider signatures are computed over the raw request body. The Next.js
 * adapter passes an unmodified Buffer to this route, so it must not be parsed
 * or re-serialized before normalizeWebhook() verifies the signature.
 */
export const webhookRouter = new Router();

webhookRouter.post(
  '/:provider',
  asyncRoute(async (req, res) => {
    const provider = req.params.provider as PaymentProviderName;
    if (!PAYMENT_PROVIDERS.includes(provider)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'errors.notFound' });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    let event;
    try {
      event = normalizeWebhook(provider, rawBody, req.headers as Record<string, string | string[] | undefined>);
    } catch (error) {
      if (error instanceof PaymentVerificationError) {
        res.status(400).json({ error: 'INVALID_SIGNATURE', message: 'billing.errors.invalidSignature' });
        return;
      }
      throw error;
    }

    if (!event) {
      res.json({ received: true, ignored: true });
      return;
    }

    try {
      const result = await applyPaymentEvent(event);
      res.json({ received: true, ...result });
    } catch (error) {
      // Two providers may deliver the same event simultaneously; the unique
      // PaymentEvent key makes the loser a harmless duplicate.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.json({ received: true, duplicate: true, applied: false });
        return;
      }
      throw error;
    }
  }),
);
