export type Source = {id:string;name:string;url:string;description:string;hosts:string[];language?:string;aiOnly?:boolean};
export type Topic = {id:string;url:string;source_id:string;source:string;title:string;original_title:string;summary:string;published_at:string|null;collected_at:string;category:string;score:number;material:string;highlight:string;angle:string;materials:string;risk:string;curated:number;media_url?:string|null;media_type?:string|null;favorite?:number;content_lang?:string;event_key?:string|null;related_urls?:string;updated_at?:string|null;disposition?:string};
export type SourceStatus = Source & {last_attempt:string|null;last_success:string|null;state:string;message:string;item_count:number};
export type Library = {topics:Topic[];sources:SourceStatus[];updatedAt:string|null;serverNow:string};
export const categories=['视觉影像','声音音乐','互动体验','好奇脑洞','AI实用','行业动态'];
