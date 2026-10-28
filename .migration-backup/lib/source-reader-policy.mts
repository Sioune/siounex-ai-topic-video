import sources from './sources.json' with {type:'json'};
import type {Source} from './types';
// Existing editorial/seed links are readable without adding unrelated RSS feeds.
const legacy:Source[]=[
 {id:'editorial-woshipm',name:'人人都是产品经理',url:'https://www.woshipm.com/',description:'已采入选题的原文读取兼容',hosts:['www.woshipm.com','woshipm.com']},
 {id:'editorial-sohu',name:'搜狐',url:'https://www.sohu.com/',description:'已采入选题的原文读取兼容',hosts:['www.sohu.com','sohu.com']},
 {id:'legacy-mit-news',name:'MIT News',url:'https://news.mit.edu/',description:'既有种子选题的原文读取兼容',hosts:['news.mit.edu']}
];
export function sourceReaderFor(sourceId:unknown,url:string):Source|undefined{
 const host=new URL(url).hostname,readers=[...sources,...legacy];
 return readers.find(source=>source.id===sourceId&&source.hosts.includes(host))||readers.find(source=>source.hosts.includes(host));
}
