import { Router } from '../lib/router.js';
import { requireAuth } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { checkoutSchema, demoConfirmSchema } from '../lib/validation.js';
import {
  PaymentConfigurationError,
  PaymentProviderError,
  PaymentVerificationError,
  configuredProvider,
  isDemoAllowed,
  verifyDemoTicket,
} from '../services/payments.js';
import {
  cancelOwnSubscription,
  confirmDemoPayment,
  getPlan,
  startCheckout,
  subscriptionResponse,
} from '../services/billing.js';
import { adminBillingRouter } from './billingAdmin.js';

const router = new Router();
router.use(requireAuth);

import type { HttpResponse } from '../lib/router.js';

function respondWithPaymentError(res: HttpResponse, error: unknown): boolean {
  if (error instanceof PaymentConfigurationError) {
    res.status(503).json({ error: 'PAYMENT_NOT_CONFIGURED', message: 'billing.errors.notConfigured' });
    return true;
  }
  if (error instanceof PaymentProviderError) {
    res.status(502).json({ error: 'PAYMENT_PROVIDER_ERROR', message: 'billing.errors.providerError' });
    return true;
  }
  if (error instanceof PaymentVerificationError) {
    res.status(400).json({ error: 'INVALID_PAYMENT', message: 'billing.errors.invalidPayment' });
    return true;
  }
  return false;
}

router.get(
  '/plan',
  asyncRoute(async (_req, res) => {
    const plan = await getPlan();
    const features = JSON.parse(plan.features) as string[];
    res.json({
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceKzt: plan.priceKzt,
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        durationDays: plan.durationDays,
        features,
      },
      paymentProvider: configuredProvider(),
      demoMode: configuredProvider() === 'demo' && isDemoAllowed(),
    });
  }),
);

router.get(
  '/subscription',
  asyncRoute(async (req, res) => {
    res.json(await subscriptionResponse(req.authUser!));
  }),
);

router.post(
  '/checkout',
  asyncRoute(async (req, res) => {
    const input = checkoutSchema.parse(req.body ?? {});
    const selected = input.provider ?? configuredProvider();
    if (selected === 'demo' && !isDemoAllowed()) {
      res.status(403).json({ error: 'DEMO_DISABLED', message: 'billing.errors.demoDisabled' });
      return;
    }
    try {
      const { transaction, checkoutUrl } = await startCheckout(req.authUser!, selected, req);
      res.json({
        checkoutUrl,
        provider: selected,
        transactionId: transaction.id,
        providerPaymentId: transaction.providerPaymentId,
        amountKzt: transaction.amountKzt,
        currency: transaction.currency,
      });
    } catch (error) {
      if (!respondWithPaymentError(res, error)) throw error;
    }
  }),
);

/** Local demo checkout only. In production this route is hard-disabled. */
router.post(
  '/demo/confirm',
  asyncRoute(async (req, res) => {
    if (!isDemoAllowed()) {
      res.status(403).json({ error: 'DEMO_DISABLED', message: 'billing.errors.demoDisabled' });
      return;
    }
    const { token, outcome } = demoConfirmSchema.parse(req.body);
    const ticket = verifyDemoTicket(token);
    if (!ticket) {
      res.status(400).json({ error: 'INVALID_PAYMENT', message: 'billing.errors.invalidPayment' });
      return;
    }
    try {
      const { result } = await confirmDemoPayment(req.authUser!, ticket, outcome);
      res.json({ result, subscription: await subscriptionResponse(req.authUser!) });
    } catch (error) {
      if (!respondWithPaymentError(res, error)) throw error;
    }
  }),
);

router.post(
  '/cancel',
  asyncRoute(async (req, res) => {
    await cancelOwnSubscription(req.authUser!);
    res.json(await subscriptionResponse(req.authUser!));
  }),
);

router.mount('/admin', adminBillingRouter);

export const billingRouter = router;
