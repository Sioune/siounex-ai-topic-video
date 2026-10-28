export type Row={id:string;[key:string]:unknown};
export type ReviewSample=Row&{metrics:Record<string,number|null>;effective:boolean;details:Record<string,unknown>;anchor:unknown;anchor_kind:string;target_hours:number|null;actual_hours:number|null};
export function sampleDetails(row:Row){
 const text=String(row.note||'');let n:Record<string,unknown>|null=null;try{const x=JSON.parse(text);if(x.schema==='sample-details-v1')n=x;}catch{}if(n)return {...n,text:String(n.text||''),supersedes_id:typeof n.supersedes_id==='string'?n.supersedes_id:null};
 // Parse only explicitly recorded facts. Keep the original row and text intact.
 const lib=/原始Library (libfile_[a-f0-9]+)/.exec(text),sha=/SHA256 ([a-f0-9]{64})/.exec(text),cutoff=/诊断截至上海(\d{1,2})月(\d{1,2})日(\d\d):(\d\d)显示(\d+)/.exec(text);let diagnostic:Record<string,unknown>|null=null;
 if(cutoff){let at:string|null=null;const observed=typeof row.observed_at==='string'?new Date(row.observed_at):null;if(observed&&Number.isFinite(observed.getTime())){const date=new Date(observed.getTime()+8*3600000);if(date.getUTCMonth()+1===Number(cutoff[1])&&date.getUTCDate()===Number(cutoff[2]))at=new Date(date.getUTCFullYear()+'-'+cutoff[1].padStart(2,'0')+'-'+cutoff[2].padStart(2,'0')+'T'+cutoff[3]+':'+cutoff[4]+':00+08:00').toISOString();}diagnostic={observed_at:at,plays:Number(cutoff[5]),time_source:'从原记录明示的同日上海截止与采样年份拆分，未重新验图'};}
 return {schema:'legacy-sample-note',text,supersedes_id:null,captured_at:row.observed_at||null,diagnostic,source:lib&&sha?{library_file_id:lib[1],sha256:sha[1],file_name:'历史截图（原记录未登记文件名）'}:null,time_source:'原记录手机采样时间；诊断仅拆分原说明明示字段，不推定缺失时间'};
}
export function effectiveSamples(rows:Row[]){const byId=new Map(rows.map(r=>[r.id,r])),replaced=new Set<string>();for(const r of rows){const prior=sampleDetails(r).supersedes_id;if(!prior)continue;if(!byId.has(prior))throw Error('采样更正前版缺失');const seen=new Set([r.id]);let id:string|null=prior;while(id){if(seen.has(id))throw Error('采样更正链循环');seen.add(id);replaced.add(id);const old=byId.get(id);id=old?sampleDetails(old).supersedes_id:null;}}return rows.filter(r=>!replaced.has(r.id));}
export function sampleSeriesKey(row:Row){const kind=String(row.sample_kind||'');return kind.startsWith('single_')&&!row.relation_id?'single':kind.startsWith('relation_')&&typeof row.relation_id==='string'&&row.relation_id?'relation:'+row.relation_id:'unclassified:'+row.id;}
export function channelReview(videos:Row[],allSamples:Row[],relations:Row[]){
 const effective=effectiveSamples(allSamples),metricKeys=['plays','three_second_rate','completion_rate','average_duration','likes','comments','shares','follows','recommendations','recommendation_views','saves'];
 const histories=videos.map(v=>{
  const samples=allSamples.filter(s=>s.video_id===v.id).sort((a,b)=>String(a.observed_at||a.created_at).localeCompare(String(b.observed_at||b.created_at))||a.id.localeCompare(b.id)).map((s):ReviewSample=>{
   const r=relations.find(r=>r.id===s.relation_id),anchor=r?.published_anchor||v.published_at,details=sampleDetails(s);
   return {...s,details,effective:effective.some(e=>e.id===s.id),metrics:typeof s.metrics==='string'?JSON.parse(s.metrics):s.metrics,anchor,anchor_kind:r?'推荐新片发布时间':'本片发布时间',target_hours:s.sample_kind==='single_t48'||s.sample_kind==='relation_followup'?48:s.sample_kind==='single_snapshot'?null:24,actual_hours:anchor&&s.observed_at?(Date.parse(String(s.observed_at))-Date.parse(String(anchor)))/3600000:null};
  });
  const current=samples.filter(s=>s.effective&&s.observed_at),latest=current.at(-1)||null,same=latest?current.filter(s=>sampleSeriesKey(s)===sampleSeriesKey(latest)):[],prior=same.at(-2)||null;
  const chronological=!!latest&&!!prior&&Date.parse(String(latest.observed_at))>Date.parse(String(prior.observed_at))&&same.filter(s=>s.observed_at===latest.observed_at).length===1&&same.filter(s=>s.observed_at===prior.observed_at).length===1;
  const changes=Object.fromEntries(metricKeys.map(k=>[k,chronological&&latest&&prior&&typeof latest.metrics?.[k]==='number'&&typeof prior.metrics?.[k]==='number'?latest.metrics[k]-prior.metrics[k]:null]));
  return {video:v,samples,latest,prior,changes,warning:'仅同一采样用途与同一推荐关系内计算累计面板变化；率变化为百分点。不同观察时长不能做因果或严格跨片质量排名。'};
 });
 return {histories,rows:histories.map(h=>({video_id:h.video.id,title:h.video.title,published_at:h.video.published_at,samples:h.samples.length,latest:h.latest,prior:h.prior,changes:h.changes,warning:h.warning})),effective_samples:effective.length,all_sample_records:allSamples.length};
}
