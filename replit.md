# 怎么用好AI · 选题库

Private Chinese-language workspace for AI story discovery, research, original material, video production/review, publishing and performance records.

## Run

Use the managed workflows:
- `artifacts/ai-studio: web` — existing UI, converted from Next/Vinext to Vite/React.
- `artifacts/api-server: API Server` — Express API, including all original API paths and `/mcp`.

`pnpm --filter @workspace/api-server test` runs isolated database/identity tests and non-mutating access-boundary smoke checks against the running API.
Authenticated browser verification uses programmatic Clerk sign-in and real session cookies. Do not insert SQLite sessions to simulate a login.

## Owner access

The original host supplied ChatGPT identity headers. They are no longer trusted.
Authentication uses Replit-managed **Clerk**, with embedded Chinese sign-in/sign-up pages and same-origin session cookies. Web API calls use the shared `@workspace/api-client-react` client; no browser bearer tokens. The Clerk proxy is mounted before body parsing.

Authorization remains the existing single-owner allowlist. Only a cryptographically verified `sessionClaims.userId` matching the securely configured `STUDIO_OWNER_ID` can access private APIs or MCP. For migrated accounts this is the original subject stored as Clerk `externalId`; for new accounts it is the Clerk ID. It is also the unchanged local ownership ID used by all business data. Never use JWT `sub`/`auth.userId` for migrated local data, profile names, emails, user-editable metadata, `REPL_OWNER_ID`, incoming identity headers, or first-registration ownership. There is no automatic local-user provisioning.

Without a configured matching owner, Clerk login can succeed but private access is denied (403), with a terminal access-denied page and client-side logout. Old opaque SQLite sessions are ignored; their schema and other existing tables remain intact.

### Secure owner enrollment

Do not enroll any test user as the real owner. Owner grants must target an explicitly authorized, verified account in the intended environment.
1. The owner creates/signs into their account in the target environment. Development and production Clerk stores are separate.
2. A trusted operator verifies the intended account and email ownership, then runs `pnpm --filter @workspace/api-server owner:inspect` with `STUDIO_OWNER_ENROLL_EMAIL` securely configured for that environment. This read-only command resolves exactly one verified account and prints its stable local ownership ID; it never grants a role, creates accounts, or changes `externalId`.
3. Configure `STUDIO_OWNER_ID` through the secure Secrets/admin flow to that ID **only after checking that it matches existing local data ownership**. If existing data has a different owner ID, stop and arrange an explicitly authorized identity binding; do not rename/reassign data or set arbitrary external IDs.
4. Restart the API and verify owner-only library/data reads, a safe reversible private operation, logout, and denial for an unrelated account. Production enrollment must run in the target production environment; do not copy development grants or production credentials into the workspace.

Anonymous browsing outside production/publishing and BYOK model-provider adapters remain separate future work.

## Data and files

The import contains source, policy JSON and starter topics, but **no live database dump or original private R2 objects**. Do not present starter topics as restored live records, or invent production, review or publication receipts.

The original database is SQLite/D1. Its schema and SQL are preserved through a Node SQLite adapter rather than converted to PostgreSQL without authorization. Every committed mutation is snapshotted to private App Storage before a successful response; startup restores that snapshot. Archive files also use private App Storage. Development and production have separate storage prefixes.

Run **one active API instance**. Generation-conditional snapshot writes reject concurrent writers rather than silently overwriting their data. A storage failure must remain an explicit failure, never a fallback to an empty library. Multiple active replicas require a separately authorized storage architecture change.

There is no test login endpoint or runtime development bypass. For browser tests only, a tester may temporarily override the development process owner allowlist to a synthetic account, then restore the managed workflow. This does not enroll the real owner or alter data ownership.

## Local Codex bridge

The bridge reuses the existing single-task Codex CLI production executor; it does not expose a local Codex port or start a persistent daemon. In the owner-only production desk, a real job in `waiting_executor` can receive a one-hour, one-job authorization. The server stores only its hash and binds it to the owner, job, and Replit HTTPS host. Reissuing for the same job rotates the old grant; the owner can also revoke it.

On the Windows machine with the existing Codex CLI and this repository synced and dependencies installed (including the runner's development dependency `sharp`), start the runner from the repository root using the command shown in the production desk. Use Node.js 22.15+, the exact local source file for the task, and the hidden JSON prompt displayed once with the grant. The local overlay routes only the existing executor API calls to Replit; it does not alter `.migration-backup/` or use the old Codex Sites identity header. Grant actions are limited to reading, claiming, heartbeating, checkpointing, submitting or failing that one production job. Drafts return to the existing site review flow; there is no auto-approval, media render, paid media adapter, or external publishing.

Do not paste the temporary token into chat, save it in source, or run commands other than the displayed bounded executor. If the local Codex run fails or its result is uncertain, inspect the task and receipts before retrying.

## Publishing service bridge

The initial `/api/v1/publishing` bridge is machine-only and read-only. It accepts a high-entropy `SERVICE_TOKEN` (at least 32 characters) only over HTTPS, rejects browser-origin requests, and derives the sole data owner from the existing database rather than request fields. `GET /tasks?state=ready` lists only queued publishing work for a currently connected, publishing-enabled account; `GET /tasks/:id/package` rereads the exact current approved package and rejects stale work. It does not claim tasks, publish, write events/receipts, or permit metrics writes. Until those operations have an agreed idempotency/lease contract and separate regression tests, all non-read requests return 405. Never expose this token to browser code or forward it to Clerk.

## Source and implementation

- `.migration-backup/` — original upstream source snapshot and operational instructions; excluded from deployment. Last synchronized from `Sioune/siounex-ai-topic-video` at `8727d4c` (see `.upstream-revision`). Upstream updates must also be reconciled into the active artifact copies; a raw Git pull does not update those copies.
- `artifacts/ai-studio/src/` — original client components, styles, policy files and route mapping.
- `artifacts/api-server/src/imported/` — original backend business rules, SQL migrations and production policy files.
- `artifacts/api-server/src/lib/studio-*` — SQLite persistence, App Storage and replacement identity boundary.
- `artifacts/api-server/src/routes/imported.ts` — Express-to-standard-Request adapter, preserving endpoint contracts and streaming.

Large worker-side production media are retained in the original import, not duplicated in the deployed API. The web app's original `public/` assets are preserved. The original worker execution scripts and live executor services were not launched or replayed as part of this migration.

Strict type-cleanup of inherited source is outside the migration scope. Use runtime checks and the managed frontend build; root `pnpm dev` is not a run command.
