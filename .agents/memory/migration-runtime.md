---
name: Migration runtime pitfalls
description: Non-obvious compatibility constraints when preserving the imported app on Vite and Node SQLite.
---

Place React imports before top-level `lazy(...)` initializers.

**Why:** Vite's CommonJS interop rewrites named React imports to local const bindings at the import's source position. The original interspersed imports worked on the prior host but produced a temporal-dead-zone runtime failure here.

**How to apply:** Keep top-level hook/component initialization below its imports, even though native ESM imports normally appear hoisted.

SQLite compatibility batches must execute synchronously inside their transactions and report actual affected-row counts.

**Why:** The imported publishing dashboard runs concurrent batches through Promise.all. Yielding within BEGIN/COMMIT causes nested transaction errors; missing changes metadata makes approval and concurrency guards misinterpret successful writes.

**How to apply:** Preserve atomic rollback, no yielding inside transactions, and correct changes metadata when modifying the database compatibility layer. Keep the isolated adapter regression test.

A managed authentication migration reporting zero users does not establish that this imported studio has no historical owners or owner-keyed data.

**Why:** The imported studio used custom OIDC and opaque local sessions, not the standard managed user bridge. The identity migration reported zero users, and no real owner identity or original live database dump was supplied.

**How to apply:** Require explicit verified owner enrollment and check stable ownership IDs before granting access. Never treat zero migrated users as permission to grant the first registrant ownership or to reassign existing records.

Dependency reconciliation after isolated-task merges can leave Vite prebundles from the previous dependency tree.

**Why:** Installed React and React DOM can be correctly aligned while the browser still receives incompatible renderer versions from prebundled dependencies.

**How to apply:** Check installed versions separately from optimized browser modules when diagnosing version mismatches after merges. Preserve startup cache invalidation for the studio dev server; a successful dependency install alone does not verify browser runtime compatibility.

Development Clerk cookie authentication also depends on its development-browser context, not just a minted session JWT.

**Why:** Sending only a session cookie from a shell can produce `dev-browser-missing` and a 401 despite a valid, correctly authorized account.

**How to apply:** Distinguish authentication-context failures from owner-authorization failures. Use a real browser context for cookie-flow verification or server-side token requests strictly for programmatic authorization checks; never change the web client to bearer-token authentication to work around a shell-only failure.

Normalize exported source line endings before three-way merging upstream updates into the Replit-adapted copies.

**Why:** The imported snapshot uses CRLF in files where later upstream versions use LF; merging those raw files can report whole-file conflicts and hide otherwise compatible updates. Git merge-file can return the number of conflict regions, not only status 1.

**How to apply:** Compare normalized text, inspect every remaining overlapping region, and retain Replit identity/runtime adapters while integrating upstream behavior. Do not silently keep an entire old file merely because the raw merge conflicted.

Validate imported compound SQLite queries against the full migrated schema, not only simplified upstream fixtures.

**Why:** A feedback UNION query passed minimal fixture tests but failed output-column resolution against the actual joined schema. An explicit output alias resolved it.

**How to apply:** Keep a full-migration adapter regression for newly imported read models, and use explicit output aliases for compound-query ordering.
