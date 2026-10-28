import test from 'node:test';import assert from 'node:assert/strict';
import {materialFeedbackRequirements,feedbackSelectionProblems} from '../scripts/automatic-material-feedback.mjs';
test('saved request to remove narration cards cannot be satisfied with another editorial card',()=>{
 const requirements=materialFeedbackRequirements('主视频为什么还有“口播要点”的文字');
 assert.equal(requirements.reject_editorial_cards,true);
 assert.equal(feedbackSelectionProblems(requirements,[{kind:'article-quote',source_kind:'approved-narration-editorial-card'}])[0].code,'owner-feedback-editorial-cards-rejected');
 assert.deepEqual(feedbackSelectionProblems(requirements,[{kind:'video'},{kind:'image'}]),[]);
 assert.equal(materialFeedbackRequirements('这里需要一个事实对比说明').reject_editorial_cards,false);
});
