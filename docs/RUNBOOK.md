# Operations runbook

## Backup and tested restore

Run `npm run backup` with a read-capable `MONGO_URL` and `mongodump` installed. Store archives outside the host with encryption and retention controls.

Test every backup on an isolated staging replica set:

1. Copy the archive to staging and point `MONGO_URL` at staging only.
2. Run `CONFIRM_RESTORE=true npm run restore -- ./backups/<archive>.archive.gz` with `mongorestore` installed.
3. Run database indexes/migrations and the API integration checks.
4. Verify organization counts, sample tenant isolation, stock ledger totals, subscriptions, and login.
5. Record the restore time and recovery-point objective. Never test a restore against production.

Production restore requires the same confirmation gate plus application write downtime. The restore command drops target collections; verify the URI and archive twice.

## Deployments

- Run `npm run lint` and `npm test`, then build the multi-stage Docker image.
- Apply schema migrations before enabling new writes.
- Configure separate development/staging/production `.env` files, strong JWT/R2/Chargily secrets, trusted CORS origins, and Redis.
- Run one API and at least one worker (`npm run worker`). MongoDB must be a replica set.
- Monitor `/health/live`, `/health/ready`, `/metrics`, Sentry, queue failures, and Chargily webhook failures.

## Incidents

- **Refresh replay spike:** revoke affected families and investigate client/token leakage.
- **Stock mismatch:** inspect StockMovement and order audit logs before reconciling in a transaction.
- **Failed webhooks:** verify raw-body HMAC configuration and idempotency before replaying events.
- **Deletion requests:** check `deletionScheduledAt`; the daily `gdpr-purge` job performs final deletion/anonymization.
