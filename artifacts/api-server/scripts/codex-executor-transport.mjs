const originValue = process.env.REPLIT_CODEX_BRIDGE_ORIGIN;
let origin;
try {
  origin = new URL(originValue);
} catch {
  throw new Error('Set REPLIT_CODEX_BRIDGE_ORIGIN to the Replit preview HTTPS origin.');
}
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' ||
    origin.search || origin.hash ||
    !(origin.hostname.endsWith('.replit.dev') || origin.hostname.endsWith('.replit.app'))) {
  throw new Error('The local Codex bridge accepts only a Replit HTTPS origin.');
}

export async function executorFetch(_url, options) {
  if (options?.method !== 'POST' || options.redirect !== 'error' || typeof options.body !== 'string') {
    throw new Error('The Replit Codex bridge accepts only bounded POST executor requests.');
  }
  const authorization = options.headers?.['OAI-Sites-Authorization'];
  const match = typeof authorization === 'string' && /^Bearer (cxbr1\.[A-Za-z0-9_-]{20,32}\.[A-Za-z0-9_-]{40,48})$/.exec(authorization);
  if (!match) throw new Error('A one-task Replit Codex grant is required.');
  const response = await fetch(new URL('/api/executor', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${match[1]}` },
    body: options.body,
    redirect: 'error',
    signal: options.signal,
  });
  return response;
}
