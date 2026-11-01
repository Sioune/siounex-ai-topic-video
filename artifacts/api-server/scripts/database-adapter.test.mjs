import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { readOwnerFeedback } from '../src/imported/lib/owner-feedback-records.mts';

test('SQLite adapter preserves atomic batches, concurrent reads, and affected-row counts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-adapter-'));
  try {
    const output = path.join(root, 'dist/adapter.mjs');
    await mkdir(path.dirname(output), { recursive: true });
    await cp(path.resolve(import.meta.dirname, '../src/imported/drizzle'), path.join(root, 'src/imported/drizzle'), { recursive: true });
    await build({
      entryPoints: [path.resolve(import.meta.dirname, '../src/lib/studio-database.ts')],
      bundle: true, platform: 'node', format: 'esm', outfile: output,
      plugins: [{ name: 'isolated-storage', setup(b) {
        b.onResolve({ filter: /studio-storage$/ }, () => ({ path: 'storage', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
          let bytes, generation=0;
          export function privateFile() {return {
            async getMetadata(){if(!bytes)throw Object.assign(new Error('not found'),{code:404});return [{generation:String(generation)}]},
            async download(){if(!bytes)throw Object.assign(new Error('not found'),{code:404});return [bytes]},
            async save(value,options){if(String(options.preconditionOpts.ifGenerationMatch)!==String(generation))throw new Error('generation mismatch');bytes=Buffer.from(value);generation++}
          }}
        ` }));
      } }],
    });
    const { initializeStudioDatabase, studioDatabase: db, persistStudioDatabase } = await import(pathToFileURL(output).href);
    await initializeStudioDatabase();
    // The full schema has overlapping joined-column names that simplified
    // upstream fixtures omit; exercise compound-query column resolution here.
    assert.deepEqual(await readOwnerFeedback(db, 'synthetic-feedback-no-records'), []);
    await db.exec('CREATE TABLE adapter_test(id TEXT PRIMARY KEY, value TEXT)');
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => db.batch([
      db.prepare('INSERT INTO adapter_test VALUES (?,?)').bind(String(i), 'value'),
      db.prepare('SELECT count(*) AS total FROM adapter_test'),
    ])));
    for (const batch of results) assert.equal(batch[0].meta.changes, 1);
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO adapter_test VALUES ('rollback','must not persist')"),
      db.prepare('INSERT INTO missing_table VALUES (1)'),
    ]));
    assert.equal(await db.prepare("SELECT * FROM adapter_test WHERE id='rollback'").first(), null);
    assert.equal((await db.prepare("UPDATE adapter_test SET value='updated' WHERE id='0'").run()).meta.changes, 1);
    assert.equal((await db.prepare("UPDATE adapter_test SET value='updated' WHERE id='missing'").run()).meta.changes, 0);
    assert.equal((await db.prepare('SELECT count(*) AS total FROM adapter_test').first()).total, 8);
    await persistStudioDatabase();
  } finally { await rm(root, { recursive: true, force: true }); }
});
