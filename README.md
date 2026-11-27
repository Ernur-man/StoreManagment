# WishStock

WishStock is a bilingual (English / Russian) retail demand and inventory management app. It turns missed sizes and colors into tracked customer requests, automatically matches them with stock arrivals, and keeps the whole team focused on the right follow-up.

The UI is based on the supplied `WishStock_Store_Management.html` prototype and rebuilt as a full-stack application with persistent data, authentication, role-based access control, analytics and in-app notifications.

## Hosting model

WishStock is a **single Next.js 14 App Router + TypeScript project**. The browser UI and every `/api/*` endpoint are served by the same Vercel deployment:

- Frontend: React 18 components from `src/views` and `src/components`, rendered through thin client wrappers in `app/`.
- Backend: one dynamic Route Handler, `app/api/[...path]/route.ts`, running on the Next.js **Node.js runtime** as Vercel Functions.
- Database: **PostgreSQL** (recommended: Neon via the Vercel Marketplace), accessed with Prisma 5 through a pooled runtime URL and a direct URL for migrations.
- No Express server, no Render/Railway/Fly/AWS host, no separate API origin, no local filesystem writes and no background workers.

## Tech stack

**Frontend** — React 18, Next.js App Router, TypeScript, Tailwind CSS, Zustand, Recharts, lucide-react, Zod, Vitest. React Router APIs used by the preserved UI are provided by a small local adapter (`app/router-shim.tsx`), so page components were not redesigned.

**Backend** — Next.js Route Handlers + Vercel Functions, Prisma 5/PostgreSQL, bcryptjs password hashing, JWT in an httpOnly cookie, Zod validation. The original Express route bodies kept their behavior through the small Express-compatible adapter in `server/lib/router.ts`.

## Quick start (local)

Requirements: Node.js 20 or newer, npm, and a PostgreSQL connection. Use a throwaway local Postgres database or a Neon branch; the old SQLite file is only used for the one-time transfer described below. The transfer script additionally needs Node.js 22.5+ for `node:sqlite`; the running app works on Node.js 20+.

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
# Edit .env: set DATABASE_URL (pooled) and DIRECT_URL (direct)
npm run db:migrate            # create the PostgreSQL schema
npm run db:seed               # ONLY for a fresh throwaway database
npm run dev                   # Next.js on http://localhost:3000
```

- App: **http://localhost:3000**
- Health check: **http://localhost:3000/api/health**

There is no separate API port and no Vite proxy: the browser calls same-origin `/api/*`, which Next.js routes to the Vercel Function.

### Demo accounts

All demo data is clearly fictional. No real customer details are included. These credentials are hidden from the login screen in production builds; the list below applies only to local/throwaway demo databases. Do not seed these accounts into production.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@wishstock.app` | `Demo1234!` |
| Manager | `manager@wishstock.app` | `Demo1234!` |
| Employee | `employee@wishstock.app` | `Demo1234!` |

The seeded demo states demonstrate the whole subscription lifecycle: the admin has an **active** Pro subscription, the manager has a **cancelled** subscription whose paid period is still running (access preserved), and the employee has an **inactive** subscription and is redirected to the subscription page. The original SQLite database also contains acceptance-test rows; those are preserved by the transfer script rather than replaced by seeding.

## Preserving existing data

The original SQLite database and migration history are present in the working copy but the database binaries are gitignored, so they are not pushed to GitHub:

- `prisma/dev.db` — original source database.
- `prisma/dev.sqlite.backup` — byte-for-byte backup of the source.
- `prisma/sqlite-migrations/` — original SQLite migrations, retained for history only. Do **not** apply these to PostgreSQL.

If a fresh clone needs the legacy rows, copy one of the SQLite files into `prisma/` from a trusted backup before running the transfer. After `npm run db:migrate` has created the PostgreSQL schema, copy the rows without deleting or reseeding anything (Node.js 22.5+ required):

```bash
DATABASE_URL="<pooled postgres url>" npm run db:transfer
# or: TRANSFER_DATABASE_URL="<pooled postgres url>" npm run db:transfer
# optional: SQLITE_PATH=./prisma/dev.sqlite.backup
```

The script reads every table with Node's built-in `node:sqlite` and writes through Prisma in FK-safe order with `createMany({ skipDuplicates: true })`. Primary keys, foreign keys and timestamps are preserved, and the transfer is safe to retry. Verify row counts before cutting over.

## Subscriptions & billing

There is exactly one plan: **WishStock Pro — 7,990 ₸ / month**, with **30 days of access** per payment. There are no other tiers, no free trial and no automatic renewal; subscribers renew manually from the billing page.

- **Subscription page (`/billing`)** — plan name, `7,990 ₸ / month`, included features, current status, start date, next conditional renewal date (DEMO) and expiration date, **Subscribe Now**, **Payment Methods**, DEMO renewal simulation and **Manage Subscription** with cancellation. Checkout is disabled and an availability notice is shown when server configuration is incomplete; no success banner is derived from URL query parameters. Login, account settings and billing are never Pro-gated.
- **Statuses** — `inactive`, `pending`, `active`, `past_due`, `cancelled`, `expired`. Access is granted only while a paid period is running (`active`) or after cancellation until the stored expiration date. Expiry is derived from timestamps on every request, so no scheduler is needed.
- **Backend enforcement** — `requireProAccess` protects products, requests, arrivals, customers, dashboard and notifications APIs. The frontend `RequirePro` layout mirrors this only for navigation; it is never the security boundary.
- **Payments** — checkout is created on the server. The client never sends a status, amount or payment result, and cannot choose a provider other than the server-configured one. `PAYMENT_PROVIDER` is explicit: a missing or unknown value disables checkout and returns HTTP 503 (`PAYMENTS_UNAVAILABLE`) instead of silently falling back to demo. Stripe requires a valid-looking `STRIPE_SECRET_KEY` (`sk_test_`/`sk_live_`), `STRIPE_WEBHOOK_SECRET` (`whsec_`) and a non-local HTTPS `APP_URL`. Card data is handled only in the DEMO vault: only published test PANs are accepted; PAN/CVV are validated in memory and discarded, while the database stores only brand, last4, holder name and expiry. Activation happens only after a **signed webhook** (Stripe) or a **signed demo confirmation** when demo is fully configured.
- **Demo mode** — `PAYMENT_PROVIDER=demo` is a labelled simulation that never contacts a bank or charges money. In production it also requires the explicit opt-in `ALLOW_DEMO_PAYMENTS=true` and a dedicated `PAYMENT_DEMO_WEBHOOK_SECRET`; without both, demo checkout, demo cards and demo confirmation are disabled. A real `PAYMENT_PROVIDER=stripe` configuration always disables demo controls, even if a stale demo secret exists. Demo checkout can simulate success, failure and cancellation only for acceptance testing.
- **Payment Methods (`/billing/payment-methods`)** — attach, replace or remove a published test Visa/Mastercard number (for example `4242 4242 4242 4242`). Real card numbers are rejected. Only a masked `DEMO CARD` (for example `Visa •••• 4242`) is ever shown or stored.
- **Admin management** — visible only to `billing:admin` (the `ADMIN` role). Shows subscriber counts, monthly revenue, subscription history and per-record payment history. Admins can repair a status or grant 30 days manually; every change is written to the audit log.

### Webhooks

- Demo: `POST /api/billing/webhook/demo` with `x-wishstock-signature: <hex HMAC-SHA256 of the raw body using PAYMENT_DEMO_WEBHOOK_SECRET>`.
- Stripe: `POST /api/billing/webhook/stripe` with Stripe's `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET`.

The raw body is passed to signature verification before JSON parsing. Invalid, replayed and mismatched-amount events are rejected. Provider events are applied once via unique `(provider, eventId)`, so duplicate deliveries cannot extend a subscription twice. KZT minor units are `7,990 KZT = 799000`.

> Kazakhstan is not currently a supported Stripe **business country**, so a real Stripe account may not be available there even though KZT presentment works. No Kaspi or other local-provider credentials were provided, so only the demo and Stripe adapters are implemented. Do not switch to production without a verified merchant account and its real webhook secret. A configured-but-incomplete provider (including missing `APP_URL`, Stripe keys or demo opt-in) is treated as unavailable; no fake success is ever shown to a customer.

## What you can do

- **Dashboard** — live KPIs and charts derived from the database, follow-up queue and recent activity.
- **Inventory** — products with independent size/color variants, per-variant quantity and low-stock thresholds, full CRUD, search, filters, sorting and stock adjustment.
- **Customer Requests** — all request fields, six statuses, date/status/source filters, CSV and Excel export, edit/view/delete with confirmation.
- **Automatic matching** — an arrival creates an `ArrivalMatch` for every waiting request with the same SKU + size + color (case- and separator-insensitive). Matching is transactional and duplicate-safe.
- **Stock Arrivals** — register incoming stock, see matched customers, call/WhatsApp links and the contact → reserved → purchased workflow.
- **Customers** — deduplicated by normalized phone, with demand history, purchase history and contact details.
- **Analytics** — 7/30/90-day and all-time ranges, demand trend, conversion rate, top products/sizes/colors and request sources.
- **Notifications** — in-app alerts for stock matches; stored as translation keys and rendered in the active language.
- **Settings** — store profile, team members with RBAC, audit log, interface language.
- **Localization** — English default, Russian switch in the top navigation and on the login screen; choice persisted in `localStorage` after hydration.

## Useful commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js app on `http://localhost:3000` |
| `npm run build` | Generate Prisma Client and build the production Next.js app |
| `npm start` | Serve the built Next.js app (used by Vercel) |
| `npm run typecheck` | Run TypeScript checks |
| `npm test` | Run Vitest unit tests (normalization, i18n parity, subscription lifecycle, payment readiness/gating, webhook signatures, Resend outbox, PATCH schemas) |
| `npx prisma validate` | Validate `prisma/schema.prisma` without touching the database |
| `npm run db:migrate` | Apply PostgreSQL migrations with `DIRECT_URL` (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create a development migration interactively |
| `npm run db:seed` | Load fictional demo data into a **fresh throwaway** database |
| `npm run db:studio` | Inspect the PostgreSQL database |
| `npm run db:transfer` | One-time SQLite → PostgreSQL row transfer (does not delete data) |
| `npm run smoke` | API acceptance script (mutates data; development only) |
| `npm run smoke:billing` | Billing acceptance script (mutates data; development only) |

> Both smoke scripts mutate data and use demo payments. Never run them against production.

## Configuration

Set these in Vercel Project Settings → Environment Variables (or in a local `.env`). See `.env.example` for URL formats.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled PostgreSQL URL used at runtime; include `?pgbouncer=true` when using Neon's pooler |
| `DIRECT_URL` | Direct (non-pooler) PostgreSQL URL used by Prisma migrations |
| `JWT_SECRET` | Required in production; long random value that signs session JWTs and demo checkout tickets |
| `APP_URL` | Public HTTPS origin, used for provider redirect URLs (not localhost in production) |
| `PAYMENT_PROVIDER` | Required. `demo` for the labelled test mode; `stripe` only with a real merchant account. Missing/unknown disables checkout |
| `ALLOW_DEMO_PAYMENTS` | Required as `true` only for production demo payments. Leave unset/false for customer-facing deployments |
| `PAYMENT_DEMO_WEBHOOK_SECRET` | Required for signed demo webhooks in production; use a dedicated secret, not `JWT_SECRET` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Both required when `PAYMENT_PROVIDER=stripe`; must be real provider-format values |
| `RESEND_API_KEY` | Server-only sending key for arrival notifications; omit to disable email without affecting arrivals |
| `RESEND_FROM_EMAIL` | Verified sender address, e.g. `WishStock <notifications@yourdomain.com>`; omit to disable email |
| `CLIENT_ORIGIN` | Optional comma-separated CORS allowlist for credentialed external API clients |
| `COOKIE_SECURE` | Optional; cookies are already `Secure` when `NODE_ENV=production` |
| `SQLITE_PATH` | Optional local source path for `npm run db:transfer` (defaults to `prisma/dev.db`) |

Keep real credentials in environment variables only. `.env` is gitignored and must never be committed.

### Arrival email notifications (Resend)

WishStock uses the official `resend` Node.js SDK **only in Next.js backend code**. The browser never receives the API key and cannot choose the sender or send arbitrary emails.

1. Create an API key at [resend.com/api-keys](https://resend.com/api-keys) with sending permission. Copy it into `RESEND_API_KEY`.
2. Verify a sending domain at [resend.com/domains](https://resend.com/domains). Resend issues DNS records (typically SPF and DKIM, and sometimes a DMARC/return-path record — use the exact records shown in your Resend dashboard). Add those records at your DNS provider and wait for Resend to show the domain as verified.
3. Set `RESEND_FROM_EMAIL` to an address on that verified domain, for example `WishStock <notifications@yourdomain.com>`. For initial testing, `onboarding@resend.dev` is allowed by Resend only when sending to the account owner's verified email; switch to your own verified domain before notifying customers.
4. In Vercel, add **both** variables to Project Settings → Environment Variables for **Development, Preview and Production** (all environments where matching arrivals should send email). This repository does not modify production environment variables automatically.
5. If either variable is missing or invalid, sending is skipped: the row stays `PENDING`, the attempt counter is not incremented, and a `RESEND_NOT_CONFIGURED` diagnostic is stored and shown in Stock Arrivals → Customer email history. A manual retry in that state returns HTTP 503 (`EMAIL_NOT_CONFIGURED`) instead of falsely reporting success. Stock arrivals, matching and inventory remain unchanged. Provider rejections are stored as `FAILED` with sanitized error text and can be retried by an authorized user. A row becomes `SENT` only when Resend returns a provider message ID; a 2xx response without an ID is recorded as `FAILED`.

Email is queued only for a customer request that has its own valid email address, and only after a `WAITING` request is successfully matched to a new arrival. Delivery is idempotent per `(arrival, request)` via a database unique index and a stable Resend idempotency key, so refreshes and duplicate events never resend a delivered notification. There is no background scheduler: if a process dies after the outbox row is committed, an authorized user must retry from Customer email history. Existing legacy requests created before the email migration may have no request email and therefore cannot be backfilled automatically.

## Deploy to Vercel

1. Import the project into Vercel. Next.js is detected automatically; no `vercel.json` or separate backend is required.
2. In the Vercel dashboard, add the **Neon (PostgreSQL)** Marketplace integration and connect it to the project. Vercel injects database variables; map the pooled value to `DATABASE_URL` (add `?pgbouncer=true` if needed) and the unpooled value to `DIRECT_URL`.
3. Add the application variables from the table above. Use the final Vercel HTTPS domain for `APP_URL`. Set `PAYMENT_PROVIDER` explicitly; in production use either a fully configured Stripe account or `PAYMENT_PROVIDER=demo` **plus** `ALLOW_DEMO_PAYMENTS=true` for a labelled test deployment.
4. From a local/CI machine with the database credentials, run `npm run db:migrate` (`prisma migrate deploy`) before sending traffic. This applies the Resend outbox migration and the idempotent `20261127120000_seed_default_subscription_plan` migration, which creates the single Pro plan without overwriting an existing row. Do not run `db:seed` against the production database: it refuses to run when `NODE_ENV=production` and contains demo users/data.
5. If migrating an existing installation, run `npm run db:transfer` after migrations and verify row counts. On a fresh database there are no users: create the first store/admin through a secure manual bootstrap before routing customers. The plan migration does not create users.
6. Deploy. Vercel runs `npm install` (the `postinstall` script runs `prisma generate`) and `npm run build`. APIs are available at `https://<domain>/api/*`.
7. Only if `PAYMENT_PROVIDER=stripe`, register the Stripe webhook at `https://<domain>/api/billing/webhook/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Demo mode needs no external provider or webhook registration.
8. For Resend email, add both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to the relevant Vercel environments, verify the sender domain in Resend, and confirm the migration is applied. Without them, arrivals still work but emails remain queued with `RESEND_NOT_CONFIGURED`.
9. Verify `/api/health`, login, Pro gating, the selected payment flow and one arrival email on a preview deployment. Do not run the mutating smoke scripts against production.

No deployment, Git push, production migration, or production environment change is performed as part of the repository changes.

## Architecture notes

- `app/api/[...path]/route.ts` is the only API entry point. `server/api.ts` mounts all original route groups at their existing `/api/*` paths.
- `server/lib/router.ts` provides the small Express-compatible request/response surface used by the unchanged route bodies, including params, query, cookies, JSON/raw body, status codes and cookie serialization.
- `server/lib/prisma.ts` caches a single PrismaClient per function instance to avoid exhausting Neon's connection pool.
- Webhook routes receive an unmodified raw `Buffer`; signature verification happens before parsing.
- `app/router-shim.tsx` maps React Router hooks/components used by the preserved UI to Next.js navigation. Route groups `(app)` and `(pro)` reproduce the original auth and Pro guards.
- No Vercel Blob is needed because the app stores no files. No Vercel Cron is needed because Pro expiry is timestamp-derived.

## Testing

- `npm run typecheck` — TypeScript.
- `npm test` — unit tests: normalization, EN/RU i18n key parity, subscription status/access rules, payment readiness/error mapping, webhook signature/replay/amount checks, mocked Resend outbox behavior and PATCH schema defaults.
- `npx prisma validate` — schema validation only; no database connection or data change.
- `npm run build` — production Next.js build and type validation.
- `npm run smoke` / `npm run smoke:billing` — end-to-end API flows against a running app with demo payments available. Start the app first (`npm run dev` or `npm start`) and use a throwaway database.

Unit tests, type checks, schema validation and the production build can be run locally. Database-backed acceptance checks require PostgreSQL credentials, which are not included in the repository. Automated tests mock payment and email providers; they do not prove a real Stripe charge or a real Resend delivery.

## Limitations

- SMS and WhatsApp are **not** sent automatically; the app provides `tel:` and `wa.me` links for staff to contact customers.
- The demo is seeded for one store. The schema is multi-store ready, but there is no store-switcher UI yet.
- Email notifications are implemented through Resend, but there is no cron/worker sweeper: stuck `PENDING` rows require an authorized manual retry. Delivery, bounces and spam placement depend on the external provider and cannot be guaranteed by this repository.
- Data export is provided for requests (CSV/Excel); there is no scheduled backup job.
- The login rate limiter is in-memory and therefore per Vercel function instance. It preserves the 12-attempt/15-minute contract per instance but is not globally distributed.
- Vercel functions run in UTC. Date-bucket logic was left unchanged rather than silently shifted.
- Payments: no Kaspi or other Kazakhstan local-provider integration; Stripe business-country restrictions apply.
- No verified auto-renew. Renewal is a manual 30-day purchase; failed/abandoned payments never grant access and never revoke an already-paid period.
- Demo activation/renewals are server-verified test operations, explicitly marked as DEMO in the UI and history; they never represent bank transactions. In production they require `ALLOW_DEMO_PAYMENTS=true` and are not intended for real customers. Real activation requires a provider-signed webhook with the correct amount and currency.
- Expiry is evaluated from timestamps on each request; no background worker or renewal reminder emails are included.
- All names, phones, emails and addresses in seed data are fictional.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) for design and local setup details.
