import {frozenSkill} from './frozen-skill.mjs';

// Verify the complete freeze first; text review needs original Markdown rules,
// not the unrelated renderer, asset manifests and implementation code.
export function textReviewSkillContext(job,node){
 if(!['source','script'].includes(node))return job.skill_snapshot;
 const {skill}=frozenSkill(job);if(!skill||typeof skill!=='object'||skill.schema!=='siounex-full-skill-freeze-v1'||skill.name!=='make-siounex-videos')return job.skill_snapshot;const files=typeof skill.contents==='object'&&skill.contents!==null?skill.contents:skill.files;
 if(!files||typeof files!=='object'||typeof files['SKILL.md']!=='string')return job.skill_snapshot;
 const selected=Object.fromEntries(Object.entries(files).filter(([name,value])=>typeof value==='string'&&(name==='SKILL.md'||/^references\/.*\.md$/i.test(name))));
 const {files:_files,contents:_contents,binary_files:_binary,file_sha256:_hashes,...metadata}=skill;
 return JSON.stringify({...metadata,files:selected,omitted_non_text_assets:true});
}

// A retry may replace precisely this field, with every other prompt byte intact.
export function projectPreviousTextReviewPrompt(original,job,node){
 const context=textReviewSkillContext(job,node),needle='\n冻结技能 '+job.skill_snapshot+'\n节点产物 ';
 if(context===job.skill_snapshot||!original.includes(needle)||original.indexOf(needle)!==original.lastIndexOf(needle))return null;
 return original.replace(needle,'\n冻结技能 '+context+'\n节点产物 ');
}
