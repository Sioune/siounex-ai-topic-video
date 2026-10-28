# Verification

## Architecture
- Vinext + Cloudflare Worker. D1 tables have schema-only Drizzle migrations.
- Owner-private Sites access boundary; user favorites use stable platform user identity, never email, browser storage, or client-provided owner IDs.
- Browser write requests require signed-in identity, JSON, and exact same-origin Origin.
- Shared `/api/refresh` additionally supports dispatch-authenticated service calls without browser Origin; `/api/status` contains only shared collector metadata. Both depend on the owner-private Sites boundary and expose no personal favorites.
- Fixed server-side RSS allowlist; no arbitrary URL fetch input; redirects are not followed, streams capped at 2.2 MB, 12-second per-source timeout, batches of two sources. Failed sources keep existing records. arXiv is cached for 24 hours.
- Unique canonical URL constraint and atomic refresh lock; publication date is distinct from collection date. Missing/invalid/future publication dates remain unknown.

## Completed locally
- TypeScript and Worker build.
- Eight real RSS fixtures parsed (488 records examined), dates normalized, URL deduplication, unknown-date and malformed-feed cases.
- Ranking, search/category/time/material/favorite combinations, and unsafe-URL rejection.
- D1 migrations applied to local database.
- Separate API requests verified save/read-back/remove operations, survival across local server restarts, and server-rendered page content, stable-user persistence and different-user isolation. Invalid Origin and arbitrary refresh URLs rejected.
- Eight independently failed outbound source requests verified failure isolation and preservation of seeded topics/favorites.

## Environment limitations
- Local Workerd outbound requests fail in this execution environment; hosted-runtime verification succeeds for all eight sources (see below).
- Local Chromium launch fails because the execution environment denies its process-singleton socket, including an approved escalation attempt. Screenshot/visual interaction QA and actual WebMCP runtime validation were unavailable. Responsive layouts and UI states were implemented; no screenshot result is claimed.
- Seed media links are discovery pointers, not reuse permission; the site surfaces this explicitly.

## Hosted-runtime verification, 2026-10-07
- Private deployment succeeded; anonymous status request denied with HTTP 403.
- Existing platform service access verified D1 schema available. First real RSS refresh succeeded on 8/8 sources, inserting 272 new records plus 9 curated seed records (281 total).
- Immediate repeat was safely rate limited.
- After the cooldown window, repeat collection succeeded with 0 new records, total stayed 281, and arXiv was served from its daily cache.

## Chinese update verification, 2026-10-08
- Recovered the existing v2 source; preserved the same Site id, D1 binding, owner-only access and favorites table.
- Four native Chinese sources, 120 real RSS records parsed. Bounded same-origin Chinese article extraction verified for QbitAI; HTTP article links in GeekPark's feed are upgraded only for allowlisted hosts.
- Tested Chinese language/relevance gates, multi-story roundup exclusion, cross-source Utopai event matching, hidden legacy/saved/rejected views and no sidebar content in article extraction.
- Local D1 schema migrations applied in order. Real-content ingest/readback, repeated-write idempotence, favorite and rejection retention across content updates, restore, produced state, and shared catalog scope verified through separate HTTP requests.
- Worker build and TypeScript checks succeeded. No browser interaction or visual QA claimed; delegated/background task skips user-facing preview.
- Event matching is conservative rule-based support, with verified explicit pairs. Daily research must compare semantic events against the full catalog and pass existing_id for genuine updates. No personal auto-scoring was introduced.
- Daily researched ingestion instructions are in DAILY_UPDATE.md. Scheduled runs need no browser, connected user computer, or republish; public Chinese source access and owner-private writer access are checked separately.

## Case-study ingestion extension, 2026-10-08
- Preserved unknown publication dates as null instead of inventing dates from crawl time or last-updated labels.
- TypeScript and Worker build passed. Two real official tutorial entries with unknown publication dates were ingested into the local test database and read back as null.
- No schema migration, access change, personal-state mutation, or scoring change required.

## Mobile detail-history change, 2026-10-09
- Added URL-backed details, one history entry per deliberate open, guarded close/back, forward re-opening, list filter/loaded-count/scroll/focus restoration, and explicit deep-link close behavior.
- Actual React hook tests: 11 groups including 20 open-close cycles, duplicate close guard, reload-like remount, invalid ids, deep links, URL preservation and pageshow.
- Actual Workspace + Radix Sheet DOM test: X, 返回列表, Escape, Forward, released scroll lock, returned focus, and zero data API calls.
- TypeScript and Worker build passed. No schema or production-data operation was changed.
- Rendered mobile/browser QA is blocked, as detailed in design-qa.md. Physical iOS/Android edge gestures have not been tested. Do not call DOM simulation a real mobile-browser test.
