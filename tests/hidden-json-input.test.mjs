import {PassThrough} from 'node:stream';
import assert from 'node:assert/strict';
import {readHiddenJsonInput} from '../scripts/hidden-json-input.mjs';
// Reproduce actual two-prompt Windows failure: residual empty CR/LF arrives
// before the second receipt. It must wait rather than pause a valid operation.
const stream=new PassThrough();
const first=readHiddenJsonInput(stream);stream.write('{"token":"test-only"}\r\n');
assert.deepEqual(JSON.parse(await first),{token:'test-only'});
const second=readHiddenJsonInput(stream);stream.write('\r\n   \r');
let settled=false;second.then(()=>settled=true);await new Promise(r=>setImmediate(r));assert.equal(settled,false);
stream.write('{"result":');stream.write('{"cost":0}}\r');
assert.deepEqual(JSON.parse(await second),{result:{cost:0}});
assert.equal(stream.listenerCount('data'),0);assert.equal(stream.listenerCount('end'),0);
const closed=new PassThrough(),pending=readHiddenJsonInput(closed);closed.end('\r\n');await assert.rejects(pending,/closed before JSON/);
const tooLarge=new PassThrough(),bounded=readHiddenJsonInput(tooLarge,{limit:5});tooLarge.write('123456');await assert.rejects(bounded,/too large/);
const cancelled=new PassThrough(),cancel=readHiddenJsonInput(cancelled);cancelled.write('\u0003');await assert.rejects(cancel,/Cancelled/);
console.log('Actual residual-terminator regression, complete receipt, bounds, cancellation and EOF passed; no media or API calls.');
