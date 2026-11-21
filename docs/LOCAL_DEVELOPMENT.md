# Local development

WishStock runs as one Next.js app locally, just like on Vercel: the UI and `/api/*` are served from the same origin. PostgreSQL is the only supported database; SQLite files remain only as a migration source and rollback backup.

## First run

Requirements: Node.js 20+, npm, and a PostgreSQL database (local Postgres or a Neon branch from the Vercel Marketplace).

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
# Edit .env: set DATABASE_URL (pooled) and DIRECT_URL (direct)
npm run db:migrate
npm run db:seed               # ONLY for a fresh throwaway database
npm run dev
```

- App: http://localhost:3000
- Health: http://localhost:3000/api/health

Do not run `npm run db:seed` against a database that contains data you need to keep.

## Environment

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Pooled Prisma runtime URL | Include `?pgbouncer=true` when using Neon's pooler |
| `DIRECT_URL` | Direct Prisma CLI URL | Used by `npm run db:migrate` |
| `JWT_SECRET` | JWT signing secret | Long random value; never use the example value |
| `APP_URL` | Public app origin | `http://localhost:3000` locally; HTTPS Vercel domain in production |
| `PAYMENT_PROVIDER` | `demo` locally, `stripe` for a real integration | Demo works in production only as an explicitly labelled simulation; keep `demo` if no real provider is configured |
| `PAYMENT_DEMO_WEBHOOK_SECRET` | HMAC secret for demo webhooks | Development/preview only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe credentials | Required only for `PAYMENT_PROVIDER=stripe` |
| `CLIENT_ORIGIN` | Optional CORS allowlist | Only needed for external credentialed API clients |
| `COOKIE_SECURE` | Optional escape hatch | Normally unset; cookies are `Secure` in production |

See `.env.example` for URL formats. Never commit real credentials; `.env` is gitignored.

## Database tasks

```bash
npm run db:migrate       # apply PostgreSQL migrations (uses DIRECT_URL)
npm run db:migrate:dev   # create a migration after changing schema.prisma
npm run db:studio        # inspect PostgreSQL data
npm run db:seed          # load fictional demo data into a throwaway database
```

There is intentionally no `db:push` or `db:reset` script: both bypass or destroy migration history and could wipe real data.

### Migrating the original SQLite data

The original database, backup and SQLite migration history are preserved:

- `prisma/dev.db` — source database.
- `prisma/dev.sqlite.backup` — backup copy.
- `prisma/sqlite-migrations/` — old SQLite migrations, for history only.

After applying the PostgreSQL migration:

```bash
DATABASE_URL="<pooled postgres url>" npm run db:transfer
# Or, to keep your main DATABASE_URL untouched:
TRANSFER_DATABASE_URL="<pooled postgres url>" npm run db:transfer
```

Use `SQLITE_PATH=./prisma/dev.sqlite.backup` to read the backup instead of `prisma/dev.db`. The transfer preserves IDs, timestamps and foreign keys, uses `skipDuplicates`, and never deletes or seeds data. It is safe to retry; verify row counts before switching traffic.

## Testing

```bash
npm run typecheck
npm test
npm run build
npm run dev          # in another terminal, for smoke checks
npm run smoke
npm run smoke:billing
```

The smoke scripts mutate data and rely on demo payments, so run them only against a throwaway database/app. Demo endpoints are only active with `PAYMENT_PROVIDER=demo` and remain labelled test operations in every environment.

## Differences from production

- `APP_URL` is `http://localhost:3000`; production must use the Vercel HTTPS domain.
- `PAYMENT_PROVIDER=demo` is also allowed in production as a clearly marked test mode: activation, renewals, failures and cancellations are signed/server-verified simulations and never move money. Use `stripe` only with a real merchant account and verified webhooks.
- The login limiter is in-memory in both environments, so it is per instance when scaled on Vercel.
- `npm start` serves the built Next.js app locally; Vercel uses the same build output. There is no Express server, Vite proxy, separate API port or `dist/` directory.
