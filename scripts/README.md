# Scripts

Utility scripts for local dev and maintenance.

## Generate better-auth secret

```bash
pnpm --filter @asksynk/scripts generate-secret
```

## Prepare object storage (Garage bootstrap)

Idempotent HTTP bootstrap of a self-hosted Garage: applies layout, imports the
app key, creates both buckets, enables the public bucket's website, and sets CORS
(`APP_BASE_URL` + optional `CORS_EXTRA_ORIGINS`). Safe to re-run. Used as the
Railway **predeploy** command; the HTTP-driven alternative to `localdev/garage/init.sh`.

```bash
pnpm run prepare-storage
```

Env: `GARAGE_ADMIN_ENDPOINT`, `GARAGE_ADMIN_TOKEN`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PRIVATE`, `S3_BUCKET_PUBLIC`, `APP_BASE_URL`
(+ optional `S3_REGION`, `CORS_EXTRA_ORIGINS`, `GARAGE_ZONE`, `GARAGE_CAPACITY_GB`).
See `apps/api/.env.example`.
