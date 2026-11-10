# Contributing

Use Node.js 22, a MongoDB replica set, and Redis for queue development. Copy `.env.example`, never commit secrets, and keep the routes → controllers → services → models layering.

Every change needs Zod input validation, tenant-scoped queries, appropriate role/plan checks, audit records for mutations, and Jest/supertest coverage. Transactions are mandatory for stock/order invariants. Run `npm run lint`, `npm run test:unit`, and `npm test` before opening a pull request. See `docs/RUNBOOK.md` for deployment and backup procedures.
