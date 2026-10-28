export function assertCurrentSeries(job){
 const s=job.series;if(!s?.current)return;
 if(s.choice_current!==true||s.current.mode_epoch!==job.mode_epoch||s.current.job_id!==job.id)throw Error('Saved series choice is stale; owner must explicitly confirm the current mode before execution.');
}
