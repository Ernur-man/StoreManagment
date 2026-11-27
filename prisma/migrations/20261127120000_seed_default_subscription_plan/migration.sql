-- Idempotent production bootstrap for the single WishStock Pro plan.
-- Migrations previously created only tables; a fresh deployment had no plan
-- row, so billing and Pro access could not work. This insert never overwrites
-- an existing plan. First-admin creation still requires a manual, secure step.

INSERT INTO "SubscriptionPlan" (
  "id", "code", "name", "description", "priceKzt", "currency",
  "billingCycle", "durationDays", "features", "isActive", "createdAt", "updatedAt"
)
VALUES (
  'plan-wishstock-pro',
  'wishstock-pro',
  'WishStock Pro',
  'Full WishStock access for 30 days.',
  7990,
  'KZT',
  'MONTH',
  30,
  '["billing.feature.dashboard","billing.feature.inventory","billing.feature.matching","billing.feature.customers","billing.feature.team"]',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO NOTHING;
