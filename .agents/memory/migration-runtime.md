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
