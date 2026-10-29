import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || major === 22 && minor < 15) {
  throw new Error('The Replit Codex bridge runner requires Node.js 22.15 or later.');
}
const adapter = pathToFileURL(path.resolve('artifacts/api-server/scripts/codex-executor-transport.mjs')).href;
const localRequire = createRequire(import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './native-production-transport.mjs' &&
        context.parentURL?.endsWith('/.migration-backup/scripts/production-codex-executor.mjs')) {
      return { url: adapter, shortCircuit: true };
    }
    // Keep the archived source untouched while resolving its image-validation
    // dependency from the runner's explicitly installed development packages.
    if (specifier === 'sharp' && context.parentURL?.includes('/.migration-backup/')) {
      return { url: pathToFileURL(localRequire.resolve('sharp')).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
