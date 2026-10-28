import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function frozenSkill(job){
 const skill=JSON.parse(job.skill_snapshot),files=typeof skill.contents==='object'&&skill.contents!==null?skill.contents:skill.files;
 // Legacy snapshots hash the files map; newer ones hash the contents map.
 // The legacy convenience concatenation was not hashed, so never use it as instructions.
 const serialized=files&&typeof files==='object'?(skill.schema==='siounex-full-skill-freeze-v1'?JSON.stringify({files,binary_files:skill.binary_files}):JSON.stringify(files)):typeof skill.contents==='string'?skill.contents:undefined;
 if(!serialized||!skill.sha256||sha(serialized)!==skill.sha256)throw Error('Frozen skill contents do not match the job hash; no generation');
 if(skill.file_sha256&&files)for(const [file,expected] of Object.entries(skill.file_sha256)){if(skill.binary_files?.[file]){if(skill.schema!=='siounex-full-skill-freeze-v1'||skill.binary_files[file].sha256!==expected||!Number.isInteger(skill.binary_files[file].bytes))throw Error('Frozen binary manifest changed: '+file)}else if(typeof files[file]!=='string'||sha(files[file])!==expected)throw Error('Frozen skill file changed: '+file)}
 return {skill,promptText:serialized};
}
