import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { privateFile } from './studio-storage';

const runtime = path.resolve(import.meta.dirname, '../.runtime');
const filename = path.join(runtime, 'studio.sqlite');
let connection: DatabaseSync;
let revision = 0;
let persistedRevision = -1;
let persistenceQueue = Promise.resolve();
let generation: string | number = 0;

export async function initializeStudioDatabase() {
  mkdirSync(runtime, { recursive: true });
  // App Storage is the durable copy. Never silently start an empty database
  // when storage is temporarily unavailable.
  try {
    const file = privateFile('database.sqlite');
    const [metadata] = await file.getMetadata();
    generation = String(metadata.generation);
    const [snapshot] = await file.download();
    writeFileSync(filename, snapshot);
  } catch (error: any) {
    if (error.code !== 404) throw error;
  }
  connection = new DatabaseSync(filename);
  connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS _studio_migrations (name TEXT PRIMARY KEY)');
  const migrations = path.resolve(import.meta.dirname, '../src/imported/drizzle');
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) {
    if (connection.prepare('SELECT name FROM _studio_migrations WHERE name=?').get(name)) continue;
    connection.exec('BEGIN');
    try {
      connection.exec(readFileSync(path.join(migrations, name), 'utf8'));
      connection.prepare('INSERT INTO _studio_migrations(name) VALUES (?)').run(name);
      connection.exec('COMMIT');
    } catch (error) { connection.exec('ROLLBACK'); throw error; }
  }
  connection.exec('CREATE TABLE IF NOT EXISTS _studio_sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)');
  revision++;
  await persistStudioDatabase();
}

export async function persistStudioDatabase() {
  const result = persistenceQueue.then(async () => {
    if (persistedRevision === revision) return;
    const savingRevision = revision;
    await privateFile('database.sqlite').save(readFileSync(filename), {
      resumable: false, contentType: 'application/vnd.sqlite3',
      preconditionOpts: { ifGenerationMatch: generation },
    });
    const [metadata] = await privateFile('database.sqlite').getMetadata();
    generation = String(metadata.generation);
    persistedRevision = savingRevision;
  });
  persistenceQueue = result.catch(() => {});
  return result;
}

function statement(sql: string, bindings: any[] = []) {
  const params = () => bindings.map(v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  function execute<T>(callback: () => T) {
    const before = Number(connection.prepare('SELECT total_changes() AS n').get()!.n);
    const value = callback();
    const changed = Number(connection.prepare('SELECT total_changes() AS n').get()!.n) > before;
    if (changed) revision++;
    return { value, meta: { changes: changed ? Number(connection.prepare('SELECT changes() AS n').get()!.n) : 0, last_row_id: Number(connection.prepare('SELECT last_insert_rowid() AS n').get()!.n) } };
  }
  return {
    bind(...values: any[]) { return statement(sql, values); },
    async first(column?: string) { const { value: row } = execute(() => connection.prepare(sql).get(...params())); return column ? row?.[column] ?? null : row ?? null; },
    allSync() { const { value, meta } = execute(() => connection.prepare(sql).all(...params())); return { success: true, results: value, meta }; },
    async all() { return this.allSync(); },
    async raw() { return (await this.all()).results.map(r => Object.values(r)); },
    async run() { const { meta } = execute(() => connection.prepare(sql).run(...params())); return { success: true, results: [], meta }; },
  };
}

export const studioDatabase = {
  prepare: statement,
  async batch(statements: ReturnType<typeof statement>[]) {
    connection.exec('BEGIN');
    try { const results = statements.map(s => s.allSync()); connection.exec('COMMIT'); return results; }
    catch (error) { connection.exec('ROLLBACK'); throw error; }
  },
  async exec(sql: string) { revision++; connection.exec(sql); return { count: 0, duration: 0 }; },
};

export function sessionGet(id: string): any {
  const row = connection.prepare('SELECT data FROM _studio_sessions WHERE id=? AND expires>?').get(id, Date.now());
  return row ? JSON.parse(String(row.data)) : null;
}
export function sessionSet(id: string, data: unknown, ttl: number) {
  revision++;
  connection.prepare('INSERT OR REPLACE INTO _studio_sessions VALUES (?,?,?)').run(id, JSON.stringify(data), Date.now() + ttl);
}
export function sessionDelete(id: string) {
  revision++; connection.prepare('DELETE FROM _studio_sessions WHERE id=?').run(id);
}
