import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
const base = git('merge-base', 'main', 'origin/main');
const paths = git('diff', '--name-only', '--diff-filter=ACMRT', base, 'origin/main')
  .split('\n')
  .filter(Boolean);
const temp = mkdtempSync(path.join(tmpdir(), 'github-sync-'));
const result = { updated: 0, added: 0, merged: 0, conflicts: 0, skipped: 0 };

function readAt(rev, file) {
  const check = spawnSync('git', ['cat-file', '-e', `${rev}:${file}`], { cwd: root });
  return check.status === 0
    ? execFileSync('git', ['show', `${rev}:${file}`], { cwd: root })
    : null;
}

function activeTargets(source) {
  const [area, ...rest] = source.split('/');
  const relative = rest.join('/');
  if (!relative) return [];
  if (area === 'app') {
    return source.startsWith('app/api/') || source.startsWith('app/mcp/')
      ? [`artifacts/api-server/src/imported/${source}`]
      : [`artifacts/ai-studio/src/${source}`];
  }
  if (area === 'components' || area === 'hooks' || area === 'public') {
    return [`artifacts/ai-studio/src/${source}`];
  }
  if (area === 'lib') {
    return [`artifacts/ai-studio/src/${source}`, `artifacts/api-server/src/imported/${source}`];
  }
  if (area === 'production') {
    const candidates = [
      `artifacts/ai-studio/src/${source}`,
      `artifacts/api-server/src/imported/${source}`,
    ];
    return candidates.filter((target) => existsSync(path.join(root, path.dirname(target))));
  }
  if (area === 'db' || area === 'drizzle') {
    return [`artifacts/api-server/src/imported/${source}`];
  }
  return [];
}

function mergeBytes(local, original, incoming) {
  if (!original || local.includes(0) || incoming.includes(0) || original.includes(0)) {
    return local.equals(original) ? { content: incoming, conflicted: false } : null;
  }
  const names = ['local', 'base', 'remote'].map((name) => path.join(temp, name));
  [local, original, incoming].forEach((content, index) => writeFileSync(names[index], content));
  const merged = spawnSync('git', ['merge-file', '-p', ...names], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (merged.status === 0) return { content: merged.stdout, conflicted: false };
  if (merged.status < 0 || merged.status > 127) {
    throw new Error(JSON.stringify({
      status: merged.status,
      error: merged.error?.message,
      stderr: merged.stderr?.toString(),
    }));
  }

  const lines = merged.stdout.toString('utf8').split('\n');
  const resolved = [];
  let index = 0;
  let conflict = false;
  while (index < lines.length) {
    if (!lines[index].startsWith('<<<<<<< ')) {
      resolved.push(lines[index++]);
      continue;
    }
    conflict = true;
    index++;
    while (index < lines.length && lines[index].trim() !== '=======') resolved.push(lines[index++]);
    if (index < lines.length) index++;
    while (index < lines.length && !lines[index].startsWith('>>>>>>> ')) index++;
    if (index < lines.length) index++;
  }
  return { content: Buffer.from(resolved.join('\n'), 'utf8'), conflicted: conflict };
}

function syncTarget(source, target, original, incoming) {
  const destination = path.join(root, target);
  const local = existsSync(destination) ? readFileSync(destination) : null;
  if (!local) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, incoming);
    result.added++;
    return;
  }
  if (local.equals(incoming)) return;
  let merged;
  try {
    merged = original ? mergeBytes(local, original, incoming) : { content: local, conflicted: true };
  } catch (error) {
    throw new Error(`${source} -> ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!merged) {
    result.conflicts++;
    console.warn(`Skipped binary overlap: ${target}`);
    return;
  }
  writeFileSync(destination, merged.content);
  if (merged.conflicted) {
    result.conflicts++;
    console.warn(`Kept Replit changes in overlapping lines: ${target}`);
  } else {
    result.merged++;
  }
  result.updated++;
}

try {
  for (const source of paths) {
    const incoming = readAt('origin/main', source);
    if (!incoming) continue;
    const original = readAt(base, source);

    // Keep the imported source snapshot current for the existing local executor.
    syncTarget(source, `.migration-backup/${source}`, original, incoming);

    for (const target of activeTargets(source)) {
      syncTarget(source, target, original, incoming);
    }
  }
  console.log(JSON.stringify({ base, upstream: git('rev-parse', '--short', 'origin/main'), paths: paths.length, ...result }, null, 2));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
