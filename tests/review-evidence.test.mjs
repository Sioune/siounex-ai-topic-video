import assert from 'node:assert/strict';import {validateReviewEvidence} from '../scripts/milestone-cli.mjs';
const artifact=JSON.stringify({script:'第一行\n发布日期未知。',facts:['免费测试范围限三份文件；']});const report={checks:[{evidence:'“发布日期未知。”'},{evidence:'「免费测试范围限三份文件。」'}]};
assert.deepEqual(validateReviewEvidence(report,artifact,[]).checks.map(x=>x.evidence),['发布日期未知','免费测试范围限三份文件']);
assert.throws(()=>validateReviewEvidence({checks:[{evidence:'已开放所有商用授权'}]},artifact,[]));
assert.throws(()=>validateReviewEvidence({checks:[{evidence:'“。”'}]},artifact,[]));
console.log('PASS: exact evidence spans tolerate decorative quotation/terminal punctuation and decoded JSON text, reject invented or empty evidence.');
