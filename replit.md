# 怎么用好AI · 选题库

Private Chinese-language workspace for AI story discovery, research, original material, video production/review, publishing and performance records.

## Run

Use the managed workflows:
- `artifacts/ai-studio: web` — existing UI, converted from Next/Vinext to Vite/React.
- `artifacts/api-server: API Server` — Express API, including all original API paths and `/mcp`.

`pnpm --filter @workspace/api-server test` runs isolated database-adapter tests and authenticated development smoke checks against the running API.
`node artifacts/api-server/scripts/migration-browser.mjs` runs the browser checks; it needs the workflows and the Replit Chromium binary. Screenshots go into ignored `generated-artifacts/migration/`.

## Owner access

The original host supplied ChatGPT identity headers. They are no longer trusted.
The replacement uses Replit OIDC with PKCE, secure HTTP-only sessions, and owner restriction. Set `STUDIO_OWNER_ID` to the owner's Replit user ID. `REPL_OWNER_ID` is accepted when available. Only the verified OIDC subject is compared; display names and usernames never authorize access.

Without a matching owner, sign-in is intentionally denied. Do not replace this with first-visitor ownership or a public development bypass. The owner account was not provided during migration, so the real OIDC owner callback remains unverified.

## Data and files

The import contains source, policy JSON and starter topics, but **no live database dump or original private R2 objects**. Do not present starter topics as restored live records, or invent production, review or publication receipts.

The original database is SQLite/D1. Its schema and SQL are preserved through a Node SQLite adapter rather than converted to PostgreSQL without authorization. Every committed mutation is snapshotted to private App Storage before a successful response; startup restores that snapshot. Archive files also use private App Storage. Development and production have separate storage prefixes.

Run **one active API instance**. Generation-conditional snapshot writes reject concurrent writers rather than silently overwriting their data. A storage failure must remain an explicit failure, never a fallback to an empty library. Multiple active replicas require a separately authorized storage architecture change.

Do not restart the API during browser/smoke tests: they create short-lived synthetic sessions directly in the development SQLite cache, then delete those sessions and persist cleanup through logout. There is no test login endpoint.

## Source and implementation

- `.migration-backup/` — untouched imported source and operational instructions; excluded from deployment.
- `artifacts/ai-studio/src/` — original client components, styles, policy files and route mapping.
- `artifacts/api-server/src/imported/` — original backend business rules, SQL migrations and production policy files.
- `artifacts/api-server/src/lib/studio-*` — SQLite persistence, App Storage and replacement identity boundary.
- `artifacts/api-server/src/routes/imported.ts` — Express-to-standard-Request adapter, preserving endpoint contracts and streaming.

Large worker-side production media are retained in the original import, not duplicated in the deployed API. The web app's original `public/` assets are preserved. The original worker execution scripts and live executor services were not launched or replayed as part of this migration.

Strict type-cleanup of inherited source is outside the migration scope. Use runtime checks and the managed frontend build; root `pnpm dev` is not a run command.
