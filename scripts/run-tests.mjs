import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
// Several integration files intentionally import a common test fixture which
// builds the same local bundle. Separate processes must not overwrite that file.
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=180000',...files],{cwd:root,stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exitCode=1;}
else process.exitCode=result.status??1;
