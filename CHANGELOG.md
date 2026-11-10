# Changelog

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
