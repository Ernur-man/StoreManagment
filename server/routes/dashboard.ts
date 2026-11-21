import { Router } from '../lib/router.js';
import { requireAuth } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { getAnalytics, getDashboard, parseRange } from '../services/analytics.js';
import { requireProAccess } from '../lib/subscription.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

router.get(
  '/',
  asyncRoute(async (req, res) => {
    res.json(await getDashboard(req.authUser!.storeId));
  }),
);

router.get(
  '/analytics',
  asyncRoute(async (req, res) => {
    const range = parseRange(req.query.from, req.query.to);
    res.json(await getAnalytics(req.authUser!.storeId, range));
  }),
);

export default router;
