// Strict-output enums cannot contain control characters, quotes or backslashes.
// Keep every option an
// exact contiguous span and bound the entire enum before making a model call.
export function reviewEvidenceChoices(artifact,material){
 const candidates=[];
 function add(text){for(const line of text.split(/[\u0000-\u001f"\\]/)){for(let i=0;i<line.length;i+=25){const span=line.slice(i,i+25).trim();if(span.length>=2)candidates.push(span)}}}
 function collect(value){if(typeof value==='string')add(value);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect)}
 collect(JSON.parse(artifact));for(const source of material)add(source.text||'');
 return [...new Set(candidates)].slice(0,180);
}
