# Full Product Management API

Express 5, Mongoose 9, MongoDB, JWT, and multer API for products, inventory, and orders.

## Windows desktop client

The `desktop/` folder contains StockFlow, a secure Electron client ready for this API. It supports automatic token refresh, organization switching, role-aware product/inventory/order workflows, variants, reports, and team invitations. Run `cd desktop && npm ci && npm start`, or see `desktop/README.md` for demo mode, tests, and Windows installer instructions. Desktop CI builds installer and portable artifacts.

## Phase 0: security baseline

- Helmet security headers and configurable CORS origins.
- Global and stricter `/auth/*` rate limits with standard `RateLimit` headers.
- Structured Pino HTTP logs, generated request IDs, and credential redaction.
- Zod validation for existing request bodies, params, and query strings.
- Consistent JSON errors and production-safe internal error responses.
- `GET /health` returns `200` when MongoDB is ready and `503` otherwise.
- Startup fails fast when required environment configuration is missing or invalid.

## Setup

Requirements: Node.js 22+, npm, and a MongoDB replica set (transactions are required).

```sh
cp .env.example .env
# Replace SECRET_JWT with a securely generated value and configure MONGO_URL.
npm ci
npm run dev
```

The server listens on `0.0.0.0:5000` by default. Set `TRUST_PROXY=true` only when running behind a trusted reverse proxy.

### Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGO_URL` | Yes | — | MongoDB connection URI; use a replica set in deployed environments. |
| `SECRET_JWT` | Yes | — | JWT signing secret, at least 32 characters. Never commit it. |
| `NODE_ENV` | No | `development` | `development`, `test`, `staging`, or `production`. |
| `PORT` | No | `5000` | HTTP listen port. |
| `CORS_ORIGINS` | No | Local frontend ports | Comma-separated allowed origins; `*` permits any origin. |
| `LOG_LEVEL` | No | `info` | Pino log level. |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate-limit window in milliseconds. |
| `RATE_LIMIT_MAX` | No | `300` | Global requests per IP/window. |
| `AUTH_RATE_LIMIT_MAX` | No | `10` | Auth requests per IP/window. |
| `TRUST_PROXY` | No | `false` | Trust the first reverse proxy. |

## Phase 3: billing and plans

New organizations receive a 14-day Pro trial. Subscriptions support `trialing`, `active`, `past_due`, and `canceled`; past-due subscriptions have a seven-day grace period before automatic downgrade to Free. Cancellations take effect at the current period end.

| Plan | Products | Orders/month | Team members | API / CSV / reports |
| --- | ---: | ---: | ---: | --- |
| Free | 25 | 50 | 2 | No |
| Pro | 1,000 | 5,000 | 10 | Yes |
| Business | Unlimited | Unlimited | Unlimited | Yes |

Creation beyond a limit returns `402 UPGRADE_REQUIRED`. Monthly order usage is stored per organization/month and incremented atomically with order creation. `requireFeature` gates API access, CSV export, and report features for their respective routes.

Owner-only billing endpoints are under `/api/billing`: `GET /subscription`, `GET /usage`, `POST /checkout`, `POST /portal`, `POST /cancel`, and `GET /invoices`.

### Chargily Pay

Set `BILLING_PROVIDER=chargily`, `CHARGILY_SECRET_KEY`, and `CHARGILY_WEBHOOK_SECRET`. Checkout uses Chargily's `/checkouts` API with DZD amounts. `POST /api/billing/webhook` reads the raw body and verifies the `signature` header using HMAC-SHA512 before processing events idempotently.

Chargily does not provide the Stripe-style hosted subscription portal assumed by the generic requirements, so the portal endpoint returns `APP_URL/billing`; this API owns cancellation and subscription state. Paid webhooks activate the plan and mark the invoice paid, failed/expired events start the grace period, and canceled events downgrade to Free. Billing emails cover receipts, failed payments, and trial-ending reminders.

## Phase 2: account lifecycle and authentication

- Registration sends a 24-hour, single-use email-verification link. New users must verify before accessing organization data; legacy users without a verification field remain accessible during migration.
- `POST /auth/resend-verification` invalidates earlier verification links.
- `POST /auth/forgot-password` is non-enumerating and sends a one-hour reset link. `POST /auth/reset-password` accepts it once and revokes every refresh session.
- Access tokens expire after 15 minutes. Login, registration, and refresh set a 30-day opaque refresh token in an `httpOnly`, `sameSite=strict` cookie (secure in production).
- `POST /auth/refresh` rotates the token and stores only its SHA-256 hash. Replaying a rotated token revokes its entire token family.
- `POST /auth/logout` revokes the current token; authenticated `POST /auth/logout-all` revokes every device session.
- Passwords require 12–72 characters, upper/lowercase letters, a number, and rejection of common passwords. bcrypt uses cost 12.
- Five failed login attempts lock an account for 15 minutes. Login errors use the same `401` response for unknown users and bad passwords.

Email is provider-agnostic. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` in production. Development defaults to `console`; tests use `mock`. Verification and reset URLs point to `APP_URL` and should be handled by the frontend before submitting the token to the API.

## Phase 1: multi-tenancy

Every product, order, stock movement, dashboard aggregate, and audit log belongs to an `Organization`. Users access tenants through an active `Membership`; product names are unique per organization rather than per user.

JWTs issued by login, registration, and organization switching include an `orgId` claim. Clients can select another tenant with the `x-org-id` header, but the server always verifies an active membership and organization before executing a route.

### Roles

| Role | Permissions |
| --- | --- |
| Viewer | Read products, orders, stock, dashboards, and team membership. |
| Staff | Viewer permissions plus product, order, and stock writes. |
| Admin | Staff permissions plus invitations, member management, and audit-log reads. |
| Owner | Admin permissions plus billing permission and organization deletion. |

The final active owner cannot be removed, demoted, or leave. Only owners can manage owner roles or delete an organization.

### Organization endpoints

- `GET /api/organizations` — list the authenticated user's active organizations.
- `POST /api/organizations/switch` — issue a JWT scoped to another verified organization.
- `GET /api/organizations/members` — list active members.
- `POST /api/organizations/invites` — admin+; create a signed, seven-day invitation.
- `POST /api/organizations/invites/accept` — authenticated invitee; accept a single-use token.
- `PATCH /api/organizations/members/:id/role` — admin+; change a member role.
- `DELETE /api/organizations/members/:id` — admin+; remove a member.
- `POST /api/organizations/leave` — leave the active organization.
- `DELETE /api/organizations` — owner only; soft-delete the organization and suspend memberships.
- `GET /api/organizations/audit-logs` — admin+; paginate and filter by `action`, `entity`, or `actor`.

Until the Phase 2 email transport is introduced, invitation responses include the signed token so it can be delivered by an integration or copied manually. Tokens are stored only as SHA-256 hashes.

### Migrating existing data

Back up MongoDB first, then run:

```sh
npm run migrate:tenancy
```

The migration creates an owner organization for each legacy `owner`, replaces `owner` with `organization` on products/orders/stock movements, removes the old product-name index, and builds tenant-scoped indexes. Existing users must log in again to receive an `orgId` claim.

## Phases 4–6: platform, integrations, and administration

### Storage, cache, jobs, and observability

Product uploads use magic-byte validation, random names, EXIF rotation, Sharp resizing (maximum 1600×1600), and WebP compression. Local disk is the development/test default; production supports Cloudflare R2 with `STORAGE_DRIVER=r2` and the `R2_*` variables in `.env.example`. `npm run migrate:images` moves existing local images to the configured store.

Set `QUEUE_ENABLED=true` and `REDIS_URL` for BullMQ recurring low-stock, trial, retention, webhook, and GDPR jobs; run `npm run worker` alongside the API. With queues disabled, jobs run locally and cache uses an isolated in-memory TTL store. Product/inventory/order writes invalidate only the affected tenant cache.

`GET /health/live` is a process liveness probe; `GET /health/ready` includes MongoDB readiness. `GET /metrics` exposes Prometheus metrics and Sentry is enabled with `SENTRY_DSN`. HTTP and worker shutdown close connections gracefully. Docker, Compose (Mongo replica set and Redis), CI, and staging configuration are included.

### Features and public API

- Soft-deleted products/orders have audited staff/admin/owner restore endpoints.
- Products support SKU, barcode, cost price, and size/color variants with atomic variant stock updates.
- `/api/features` provides per-row CSV imports, CSV/XLSX exports, period sales/profit, best-seller, stock-value, movement reports, PDF invoices/labels, and delivery-provider shipment creation.
- `/api/account/notifications` manages email/SMS/WhatsApp preferences. SMS and WhatsApp use replaceable provider channels; order status changes use the customer notification adapter.
- `/api/api-keys` creates hashed, scoped, revocable, per-key-rate-limited keys. The raw key is shown once. Use `x-api-key` on `/api/v1/public/products` and `/api/v1/public/orders`.
- `/api/webhooks` manages HTTPS outgoing hooks. Deliveries sign `timestamp.rawBody` with `x-saas-timestamp` and `x-saas-signature` (HMAC-SHA256) and retry failures.
- `/api/search` performs bounded tenant-scoped product/order search. Legacy routes remain available while equivalent versioned routes are under `/api/v1`.
- Swagger UI is at `/api/docs`; the OpenAPI document is `/api/openapi.json`.

### GDPR, analytics, and super-admin

Account export/deletion and onboarding endpoints are under `/api/account`. Deletion has a 30-day grace period and revokes refresh sessions; the daily purge job finalizes due organizations and anonymizes users. Signup, activation, upgrade, and churn analytics are persisted without secrets.

Super-admin-only `/api/admin` routes list tenants, inspect usage, suspend/restore tenants, and issue audited support impersonation tokens. All tenant middleware rejects suspended/deletion-pending organizations.

### Seeds and disaster recovery

`SEED_PASSWORD=<12+ character password> npm run seed` creates an idempotent demo owner, organization, and product. Backup and restore commands wrap MongoDB Database Tools:

```sh
npm run backup
CONFIRM_RESTORE=true npm run restore -- ./backups/<archive>.archive.gz
```

Restore drops target collections and must first be rehearsed on staging. See `docs/RUNBOOK.md` and `CONTRIBUTING.md`.

## Tests

```sh
npm test          # Full suite; starts an in-memory MongoDB replica set
npm run test:unit # Phase 0 middleware/config tests without MongoDB
```

Jest starts a single-node in-memory MongoDB replica set, so order and inventory transactions run under realistic conditions. k6 load tests under `tests/load/` are excluded from Jest.

## Error responses

Errors use the following shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [{ "path": "email", "message": "Invalid email" }]
}
```

Validation failures return `422`, unknown routes `404`, duplicate resources `409`, invalid/expired tokens `401`, forbidden origins `403`, and throttled requests `429`. In production, unexpected `500` responses never include internal error details. The `x-request-id` response header can be correlated with structured logs.
