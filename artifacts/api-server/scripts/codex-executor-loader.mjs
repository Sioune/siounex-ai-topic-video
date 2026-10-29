import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

if (Number(process.versions.node.split('.')[0]) < 22) {
  throw new Error('The Replit Codex bridge runner requires Node.js 22 or later.');
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || major === 22 && minor < 15) {
  throw new Error('The Replit Codex bridge runner requires Node.js 22.15 or later.');
}
const adapter = pathToFileURL(path.resolve('artifacts/api-server/scripts/codex-executor-transport.mjs')).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './native-production-transport.mjs' &&
        context.parentURL?.endsWith('/.migration-backup/scripts/production-codex-executor.mjs')) {
      return { url: adapter, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
