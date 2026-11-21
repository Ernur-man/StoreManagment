# WishStock architecture

## Overview

WishStock is a **single Next.js 14 App Router** application deployed only on Vercel. React renders the localized UI; Next.js Route Handlers running on the Node.js runtime expose the same `/api/*` endpoints the original app used; Prisma talks to PostgreSQL.

```
Browser (React in App Router) --/api--> Vercel Function (app/api/[...path]) --Prisma--> PostgreSQL (Neon)
        |                                   |
   i18n + Zustand                  auth / RBAC / validation / transactions / signed webhooks
```

There is no separate API server, no `dist/` output, no writable local filesystem and no long-running worker. Business rules (matching, status transitions, stock changes, notifications, subscription expiry) remain server-side so they cannot be bypassed by the browser.

## Repository layout

- `app/layout.tsx`, `app/providers.tsx` — root layout, metadata, i18n, session bootstrap and global toast host.
- `app/(app)/layout.tsx`, `app/(app)/(pro)/layout.tsx` — route groups reproducing the original auth and Pro guards.
- `app/*/page.tsx` — thin client wrappers around the preserved UI. Routes are `/login`, `/billing`, `/billing/demo`, `/settings`, `/dashboard`, `/inventory`, `/requests`, `/arrivals`, `/customers`, `/analytics`.
- `app/router-shim.tsx` — local adapter implementing only the React Router APIs used by the preserved UI (`Link`, `NavLink`, `Outlet`, `Navigate`, `useNavigate`, `useLocation`, `useSearchParams`).
- `app/api/[...path]/route.ts` — the sole Vercel Functions API entry point (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`).
- `server/api.ts` — mounts the original routers at their existing `/api/*` paths and marks webhook routes as raw-body routes.
- `server/lib/router.ts` — minimal Express-compatible adapter (params, query, cookies, body, status, JSON and cookie headers) so original route bodies did not need rewriting.
- `server/routes/` — auth, billing (user + admin + webhook), products, requests, arrivals, customers, notifications, dashboard, settings.
- `server/services/matching.ts` — transactional arrival registration and automatic request matching.
- `server/services/analytics.ts` — dashboard and analytics aggregations.
- `server/services/billing.ts`, `server/services/payments.ts` — plan/subscription lifecycle, checkout, HMAC/Stripe signature verification and webhook normalization.
- `server/lib/` — auth/JWT, RBAC permissions, Zod schemas, normalization, auditing, Prisma singleton, rate limiter, CORS and error mapping.
- `prisma/schema.prisma` — 17-model PostgreSQL data model with `DATABASE_URL` (pooled runtime) and `DIRECT_URL` (CLI/migrations).
- `prisma/migrations/20261121000200_postgres_initial/` — generated PostgreSQL schema migration.
- `prisma/sqlite-migrations/`, `prisma/dev.db`, `prisma/dev.sqlite.backup` — preserved SQLite history and source data for the one-time transfer.
- `src/views/`, `src/components/` — original UI components (renamed from `src/pages` only to avoid Next.js Pages Router detection; no redesign).
- `src/i18n/`, `src/store/`, `src/lib/` — dictionaries, Zustand stores and typed API client.

## Data model highlights

- `Store` owns users, products, variants, inventory, customers, requests, arrivals, notifications, sales, audit logs, subscriptions and payment records.
- `Product` has many `ProductVariant` rows; each variant has its own SKU, size, color, price, low-stock threshold and one `Inventory` quantity.
- `CustomerRequest` keeps a `productName`, `sku`, `size` and `color` snapshot plus optional product/variant links. Status is one of `WAITING`, `AVAILABLE`, `CONTACTED`, `RESERVED`, `PURCHASED`, `CANCELLED`.
- `Customer` is unique per `(storeId, phone)` after normalization.
- `StockArrival` has `StockArrivalItem` rows. `ArrivalMatch` has a unique index on `requestId`, guaranteeing one match per request.
- `SubscriptionPlan` is the single WishStock Pro plan (`7,990 KZT`, 30 days). `Subscription` statuses are `inactive|pending|active|past_due|cancelled|expired`; `PaymentTransaction` and `PaymentEvent` provide idempotency and webhook dedupe via unique keys.
- `Notification` stores translation keys and JSON parameters, so the client renders them in the active language.
- `AuditLog` records privileged changes.

## API compatibility

`server/api.ts` preserves every original mount point:

`/api/health`, `/api/auth`, `/api/billing` (including `/admin` and `/webhook/:provider`), `/api/products`, `/api/requests`, `/api/arrivals`, `/api/customers`, `/api/notifications`, `/api/dashboard`, `/api/settings`.

Response bodies, status codes, tenant scoping (`storeId` from the verified JWT), route ordering (`/products/meta` before `/products/:id`, `/notifications/read-all` before `/:id/read`) and transaction boundaries are unchanged. The adapter maps Web `Request` cookies/headers to the small Express-shaped objects the route bodies expect, then serializes the result back to a Web `Response`.

## Automatic matching

`registerArrival()` runs inside `prisma.$transaction`:

1. Resolve or create the product/variant from arrival SKU, size and color.
2. Increment inventory for that variant.
3. Find `WAITING` requests with no existing match and compare normalized SKU, size and color.
4. Re-check eligibility inside the transaction.
5. Create `ArrivalMatch`, move requests to `AVAILABLE`, set `availableAt`, and create one notification.
6. Write an audit record.

Normalization trims, lowercases, applies NFKC and removes spaces, dashes, underscores, slashes, backslashes and dots. PostgreSQL write races are additionally guarded by the unique `ArrivalMatch.requestId` index; a `P2002` loser skips that request rather than failing the whole arrival.

## Authentication, RBAC and Pro access

- Passwords are hashed with bcryptjs (12 rounds).
- A signed JWT is stored in an httpOnly, SameSite=Lax cookie; it becomes `Secure` automatically in production.
- Login is rate-limited at 12 attempts / 15 minutes in memory per function instance (best effort on a distributed platform).
- `requireAuth` validates the token and active user on every protected route.
- `requirePermission` uses the same role matrix: **ADMIN** everything, **MANAGER** operational pages/settings/audit, **EMPLOYEE** operational reads/writes and user reads.
- `requireProAccess` applies only to products, requests, arrivals, customers, notifications and dashboard. Billing and settings are intentionally never Pro-gated.
- Subscription status is derived from timestamps on every request; no Vercel Cron job is needed.

## Payments and webhooks

Checkout is server-created. The client never submits a payment result. Webhook routes receive the exact raw body; demo HMAC and Stripe signatures are verified before JSON parsing. `applyPaymentEvent()` is a Prisma transaction keyed by `(provider, eventId)`, with transaction status/amount/currency guards. Cancellation keeps access until `expiresAt`; failure produces `past_due` without revoking a paid period. Demo payments are hard-disabled in production.

## Internationalization

`src/i18n/translations.ts` defines `en` as the source of truth for `TranslationKey`; `ru` is typed as `Record<TranslationKey, string>`, and Vitest asserts runtime parity. The provider renders with a deterministic `en` value on server and first client render, then restores `localStorage('wishstock-language')` after hydration to avoid hydration mismatches. Known demo data values are translated through `src/i18n/data.ts`; user-generated content passes through unchanged.

## Build, data migration and deployment

- Development: `npm run dev` serves UI and `/api/*` from one Next.js process on port 3000.
- Production: Vercel runs `npm install` (which runs `prisma generate`) and `npm run build`. There is no separate backend deployment.
- PostgreSQL schema: `npm run db:migrate` uses `DIRECT_URL`. The generated migration is PostgreSQL-specific; SQLite migrations were retained only as history.
- Existing data: `npm run db:transfer` copies rows from `prisma/dev.db` with preserved IDs/timestamps and `skipDuplicates`, without deleting or reseeding.
- Runtime connections use the pooled `DATABASE_URL`; the Prisma client is cached per function instance to protect the Neon pool.

See `README.md` for Vercel Marketplace setup, environment variables and deploy steps.
