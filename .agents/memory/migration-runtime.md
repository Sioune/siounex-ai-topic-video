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
