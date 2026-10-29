import {clickedPublicationDetails,nativePublicationInterval,publicationDetails,publicationTimeDescription} from './publication-details.mjs';
import type {dataCenter} from './data-center';import {METRICS} from './data-contract.mjs';import {ProductionError} from './production-contract';
type Data=Awaited<ReturnType<typeof dataCenter>>;
type PublicationVideo=Record<string,unknown>&{published_at?:unknown;publication_source?:unknown};
const shanghai=(v:unknown)=>v?new Date(String(v)).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false}):'';
function cell(value:unknown){if(value===null||value===undefined)return '';let v=String(value);if(typeof value==='string'&&/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
const publicationColumns=['publication_observation_range_start','publication_observation_range_end','exact_platform_published_at_utc','publication_timestamp_role','independent_platform_verification','publication_evidence_note','publication_time_description','publication_observation_matches_current_anchor'];
function publicationMetadata(video:PublicationVideo|undefined){
 const published=typeof video?.published_at==='string'?video.published_at:null,source=video?.publication_source,observation=nativePublicationInterval(source),interval=nativePublicationInterval(source,published),clicked=clickedPublicationDetails(source),reported=publicationDetails(source);
 return {precision:interval?'observed_interval':observation?'unknown':reported?.precision||clicked?.precision||'source-described',time_source:clicked?.time_source||reported?.time_source||'source-described',display:observation?publicationTimeDescription(published,source):reported?.display_time||clicked?.display_time||'',fields:[observation?.range_start,observation?.range_end,null,interval?'conservative_upper_bound_collection_anchor':observation?'unknown':clicked?.timestamp_role||reported?.timestamp_role||'source-described',clicked?.independent_platform_verification??reported?.independent_platform_verification,observation?.evidence_note||clicked?.source_note||reported?.source_note||'',publicationTimeDescription(published,source),observation?!!interval:null]};
}
function anchorKind(value:unknown){return typeof value==='string'?value.replace('发布时间','采集锚点'):value;}
export function dataExport(data:Data,format:string){
 const stamp=new Date().toISOString(),base='channel-data-'+stamp.slice(0,10),headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};let body:string,type:string,file:string;
 if(format==='json'){body=JSON.stringify({schema_version:'production_data_export_v2',exported_at:stamp,timezone:'Asia/Shanghai',units:{rates:'percent_0_100',rate_changes:'percentage_points',average_duration:'seconds',counts:'cumulative_panel'},...data},null,2);type='application/json; charset=utf-8';file=base+'.json';}
 else if(format==='summary_csv'||format==='history_csv'){
  const keys=Object.keys(METRICS),rows:unknown[][]=[];
  if(format==='summary_csv'){
   rows.push(['video_id','title','published_anchor_utc','published_at_shanghai','publication_precision','publication_time_source','published_display','sample_records','latest_phone_capture_utc','latest_phone_capture_shanghai','diagnostic_cutoff_utc','diagnostic_plays','anchor_kind','anchor_utc','target_hours','actual_hours',...keys,...keys.map(k=>'change_'+k),...publicationColumns]);
   for(const r of data.review.rows){const l=r.latest,publication=publicationMetadata(data.review.histories.find(h=>h.video.id===r.video_id)?.video);rows.push([r.video_id,r.title,r.published_at,shanghai(r.published_at),publication.precision,publication.time_source,publication.display,r.samples,l?.observed_at,shanghai(l?.observed_at),(l?.details as {diagnostic?:{observed_at?:string;plays?:number}})?.diagnostic?.observed_at,(l?.details as {diagnostic?:{plays?:number}})?.diagnostic?.plays,anchorKind(l?.anchor_kind),l?.anchor,l?.target_hours,l?.actual_hours,...keys.map(k=>l?.metrics?.[k]),...keys.map(k=>r.changes[k]),...publication.fields]);}
  }else{
   rows.push(['video_id','title','sample_id','request_id','kind','effective','phone_capture_utc','phone_capture_shanghai','registered_at_utc','diagnostic_cutoff_utc','diagnostic_plays','anchor_kind','anchor_utc','target_hours','actual_hours','source_library_id','source_sha256','supersedes_sample_id',...keys,'note','publication_precision','publication_time_source',...publicationColumns]);
   for(const h of data.review.histories)for(const s of h.samples){
    const d=s.details as {diagnostic?:{observed_at?:string;plays?:number};source?:{library_file_id?:string;sha256?:string};supersedes_id?:string;text?:string},relation=data.current_relations.find(r=>r.id===s.relation_id),anchorVideo=relation?data.current_videos.find(v=>v.id===relation.new_video_id):h.video,publication=publicationMetadata(anchorVideo);
    rows.push([h.video.id,h.video.title,s.id,s.request_id,s.sample_kind,s.effective,s.observed_at,shanghai(s.observed_at),s.created_at,d.diagnostic?.observed_at,d.diagnostic?.plays,anchorKind(s.anchor_kind),s.anchor,s.target_hours,s.actual_hours,d.source?.library_file_id,d.source?.sha256,d.supersedes_id,...keys.map(k=>s.metrics?.[k]),d.text,publication.precision,publication.time_source,...publication.fields]);
   }
  }
  body='\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');type='text/csv; charset=utf-8';file=base+(format==='summary_csv'?'-summary.csv':'-history.csv');
 }
 else if(format==='analysis_md'){body=data.analysis_reports.map(r=>'# '+r.title+'\n\n'+r.markdown).join('\n\n---\n\n');type='text/markdown; charset=utf-8';file=base+'-analysis.md';}
 else if(format==='feedback_md'){body=data.analytics.feedback.markdown;type='text/markdown; charset=utf-8';file=base+'-feedback.md';}
 else throw new ProductionError('导出格式无效',400);return new Response(body,{headers:{...headers,'Content-Type':type,'Content-Disposition':'attachment; filename="'+file+'"'}});
}
