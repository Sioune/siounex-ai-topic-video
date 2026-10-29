type VideoMilestone={id?:string;node:string;revision:number;artifact_version?:number;artifact:string;status?:string;mode_epoch?:number;created_at?:string};

// Artifact version, rather than receipt arrival time, identifies the current video.
export function latestVideoMilestone<T extends VideoMilestone>(job:{revision:number;milestones?:T[]}){
 return (job.milestones||[]).filter(m=>m.node==='video'&&m.revision===job.revision).sort((a,b)=>(b.artifact_version||0)-(a.artifact_version||0))[0];
}

export function boundNativeCandidate(job:{revision:number;approved_hash:string|null;reviews?:Record<string,unknown>[]},artifact:Record<string,unknown>|null){
 const reference=(artifact?.qa as {native_candidate_id?:unknown}|undefined)?.native_candidate_id;
 if(typeof reference!=='string')return null;
 const record=(job.reviews||[]).find(r=>r.id===reference&&r.decision==='native_video_candidate'&&Number(r.revision)===job.revision);
 if(!record)return null;
 try{const value=JSON.parse(String(record.note));return value.script_hash===job.approved_hash&&value.sha256===artifact?.sha256&&/^[a-f0-9]{64}$/.test(value.sha256)?{id:reference,at:String(record.created_at),value}:null;}catch{return null;}
}
