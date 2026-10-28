import {build} from 'esbuild';import {spawnSync} from 'node:child_process';
const banner='import {createRequire as __testRequire} from "node:module"; const require=__testRequire(import.meta.url);';
await Promise.all([
 build({entryPoints:['hooks/use-topic-navigation.ts'],bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react'],outfile:'.sites-runtime/navigation-under-test.mjs'}),
 build({entryPoints:['app/workspace.tsx'],bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/client','react/jsx-runtime'],banner:{js:banner},outfile:'.sites-runtime/workspace-under-test.mjs'})
]);
for(const file of ['tests/navigation.test.mjs','tests/workspace-navigation.test.mjs']){const result=spawnSync(process.execPath,['--experimental-strip-types',file],{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status||1)}
