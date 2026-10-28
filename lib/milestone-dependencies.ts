export const dependencies:Record<string,string[]>={source:[],script:['source'],cover:['script'],video:['script'],promotion:['cover','video'],delivery:['promotion']};
export function prerequisitesApproved(job:{revision:number;approved_revision:number|null;approved_hash:string|null;milestones?:{node:string;revision:number;status:string}[]},node:string){
 return (dependencies[node]||[]).every(prior=>{const m=job.milestones?.find(m=>m.node===prior&&m.revision===job.revision);return m?.status==='approved'||prior==='script'&&!m&&job.approved_revision===job.revision&&!!job.approved_hash;});
}
export function dependentNodes(node:string){return Object.keys(dependencies).filter(target=>{const seen=new Set<string>();const contains=(n:string):boolean=>{if(seen.has(n))return false;seen.add(n);return (dependencies[n]||[]).some(p=>p===node||contains(p));};return contains(target);});}
