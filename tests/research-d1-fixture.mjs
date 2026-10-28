// SYNTHETIC adapter constraint, not a claim that Node SQLite is Cloudflare D1.
// D1 documents a 50-byte LIKE/GLOB pattern limit. Node SQLite defaults higher.
// Only literal and positional-bound patterns used by these fixtures are needed.
export function assertD1PatternLimit(query, args = []) {
  const tokens = query.match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\?|\b(?:LIKE|GLOB)\b/gi) || [];
  let parameter = 0, pattern = false;
  for (const token of tokens) {
    if (token.startsWith('--') || token.startsWith('/*')) continue;
    if (/^(LIKE|GLOB)$/i.test(token)) {pattern = true; continue;}
    const value = token === '?' ? args[parameter++] : token.startsWith("'") ? token.slice(1, -1).replaceAll("''", "'") : undefined;
    if (pattern && typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 50) throw new Error('D1_ERROR: LIKE or GLOB pattern exceeds 50 bytes');
    pattern = false;
  }
}
