import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatFilmstripTime} from '../production/unified-runtime/time-format.mjs';
for(const [seconds,expected] of [[0,'00:00.0'],[3.1,'00:03.1'],[59.94,'00:59.9'],[59.96,'01:00.0'],[60,'01:00.0'],[62.6,'01:02.6'],[66.621333,'01:06.6'],[123.4,'02:03.4']])assert.equal(formatFilmstripTime(seconds),expected);
for(const bad of [-1,NaN,Infinity,'62.6'])assert.throws(()=>formatFilmstripTime(bad));
assert.match(fs.readFileSync(new URL('../production/unified-runtime/render-v9.mjs',import.meta.url),'utf8'),/formatFilmstripTime\(dur\)/);
assert.match(fs.readFileSync(new URL('../scripts/prepare-unified-project.mjs',import.meta.url),'utf8'),/'time-format\.mjs'/);
console.log('Filmstrip minute rollover and prepared-runtime dependency passed. Current MP4 unchanged.');
