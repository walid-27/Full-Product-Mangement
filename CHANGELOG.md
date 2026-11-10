# Changelog

## Phase 2 — Account lifecycle and authentication

### Added
- Email verification/resend and non-enumerating forgot/reset-password flows with hashed, expiring, single-use tokens.
- Fifteen-minute access tokens and rotating 30-day refresh cookies with hashed storage, token-family replay detection, logout, and logout-all.
- Cost-12 bcrypt, common/weak password rejection, per-account login lockout, and Resend/console/mock email transports.
- Account lifecycle integration tests and security primitive unit tests.

### Breaking changes
- New registrations require stronger passwords and email verification before organization-data access.
- Access tokens now expire after 15 minutes instead of 12 hours; clients must use the refresh cookie flow.
- Login/registration responses no longer expose refresh tokens in JSON; clients must accept cookies on `/auth` requests.

### Migration
1. Configure `APP_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, and `RESEND_API_KEY` when using Resend.
2. Existing users have no verification field and remain grandfathered; optionally backfill `emailVerifiedAt` for verified accounts.
3. Update clients to handle `401` refresh requirements, rotating cookies, and `403 EMAIL_NOT_VERIFIED` responses.

## Phase 1 — Multi-tenancy

### Added
- Organizations, memberships, four-role permission enforcement, tenant resolution, and organization-scoped JWTs.
- Signed expiring single-use team invitations, member role/removal/leave flows, organization switching, and owner-only deletion.
- Organization-scoped audit logs for product, order, stock, team, and organization changes.
- Cross-tenant isolation, role, invitation, team, and audit regression tests.

### Breaking changes
- `owner` was replaced by `organization` on Product, Order, and StockMovement; the product unique key is now `(name, organization)`.
- Protected data routes require a JWT `orgId` claim or verified `x-org-id` header.
- Registration now creates an organization and owner membership in a transaction. Existing users should log in again after migration.

### Migration
1. Back up the database and deploy the Phase 1 code without serving writes during migration.
2. Run `npm run migrate:tenancy` with the production `MONGO_URL` and required environment variables.
3. Verify memberships and tenant-scoped indexes, then resume traffic and have users log in again.

## Phase 0 — Security and hardening baseline

### Added
- Helmet, configurable CORS, global/auth rate limiting, Pino request logging, request IDs, and `/health`.
- Zod request validation and consistent machine-readable error codes.
- Required startup environment validation and `.env.example`.
- Phase 0 security and error-handling regression tests.

### Breaking changes
- `MONGO_URL` and a `SECRET_JWT` of at least 32 characters are now required at startup.
- Validation errors return `422`; unknown routes return a structured `404`; rate limits return `429`.
- Unexpected production errors use a generic `500` response instead of exposing internal messages.

### Migration
1. Copy `.env.example` to `.env` and set a strong `SECRET_JWT` and replica-set `MONGO_URL`.
2. Configure deployed frontend origins in `CORS_ORIGINS`.
3. Update clients to read `code`, `message`, and optional `details` from errors and handle `422`/`429` responses.
