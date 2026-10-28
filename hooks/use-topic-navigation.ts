'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {defaultView,NAV_KEY,navigationUrl,readEntry,snapshot,validTopicId,viewFromUrl,type ListView,type ListSnapshot,type TopicNavigationEntry} from '@/lib/topic-navigation';
const entryId=()=>crypto.randomUUID();
const currentTopic=()=>{const id=new URL(window.location.href).searchParams.get('topic');return validTopicId(id)?id:null};
function replaceEntry(entry:TopicNavigationEntry,url?:string){window.history.replaceState({...window.history.state,[NAV_KEY]:entry},'',url)}
export function useTopicNavigation(knownIds:ReadonlySet<string>|null){
 const [view,changeView]=useState<ListView>(defaultView),[limit,changeLimit]=useState(18),[detail,setDetail]=useState<string|null>(null),[closing,setClosing]=useState(false),[notice,setNotice]=useState('');
 const live=useRef({view,limit});live.current={view,limit};const ready=useRef(false),known=useRef(knownIds);known.current=knownIds;
 const closingRef=useRef(false),pendingRestore=useRef<ListSnapshot|null>(null),frame=useRef(0),generation=useRef(0),lastFocusId=useRef<string|null>(null);
 const saveList=useCallback(()=>{if(!ready.current||currentTopic()||pendingRestore.current)return;const old=readEntry(window.history.state);const list=snapshot(live.current.view,live.current.limit,window.scrollY,lastFocusId.current);replaceEntry({version:1,entryId:old?.kind==='list'?old.entryId:entryId(),kind:'list',topicId:null,parentListId:null,list},navigationUrl(window.location.href,list.view,null))},[]);
 const restore=useCallback(()=>{const list=pendingRestore.current;if(!list||currentTopic()||!known.current)return;cancelAnimationFrame(frame.current);const stamp=generation.current;frame.current=requestAnimationFrame(()=>{if(stamp!==generation.current||currentTopic()||document.querySelector('.topic-detail-sheet'))return;window.scrollTo({top:list.scrollY,left:0,behavior:'instant'});const trigger=list.focusId?document.querySelector<HTMLElement>(`[data-topic-id="${list.focusId}"] .card-main`):null;(trigger||document.getElementById('topic-search'))?.focus({preventScroll:true});pendingRestore.current=null;saveList()})},[saveList]);
 const sync=useCallback(()=>{generation.current++;cancelAnimationFrame(frame.current);closingRef.current=false;setClosing(false);const url=new URL(window.location.href),nextView=viewFromUrl(url);let id=currentTopic(),entry=readEntry(window.history.state);if(entry?.kind==='detail'&&entry.topicId!==id)entry=null;
  // Unknown ids are only rejected after the library has loaded.
  if(url.searchParams.has('topic')&&(!id||(known.current&&!known.current.has(id)))){id=null;setNotice('这条选题暂时无法打开，已返回列表。');const clean=navigationUrl(url.href,nextView,null);window.history.replaceState({...window.history.state,[NAV_KEY]:undefined},'',clean);entry=null}
  const list=entry?.list?snapshot(nextView,entry.list.limit,entry.list.scrollY,entry.list.focusId):snapshot(nextView,18,id?0:window.scrollY);
  live.current={view:nextView,limit:list.limit};changeView(nextView);changeLimit(list.limit);setDetail(id);lastFocusId.current=list.focusId;
  if(!entry){entry={version:1,entryId:entryId(),kind:id?'detail':'list',topicId:id,parentListId:null,list};replaceEntry(entry)}
  pendingRestore.current=id?null:list;ready.current=true;
 },[]);
 useEffect(()=>{const previous=window.history.scrollRestoration;window.history.scrollRestoration='manual';sync();window.addEventListener('popstate',sync);window.addEventListener('pageshow',sync);window.addEventListener('pagehide',saveList);let scrollFrame=0;const onScroll=()=>{if(currentTopic()||pendingRestore.current||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;saveList()})};window.addEventListener('scroll',onScroll,{passive:true});return()=>{window.history.scrollRestoration=previous;window.removeEventListener('popstate',sync);window.removeEventListener('pageshow',sync);window.removeEventListener('pagehide',saveList);window.removeEventListener('scroll',onScroll);cancelAnimationFrame(scrollFrame);cancelAnimationFrame(frame.current)}},[sync,saveList]);
 useEffect(()=>{if(ready.current&&knownIds&&currentTopic()&&!knownIds.has(currentTopic()!))sync()},[knownIds,sync]);
 useLayoutEffect(()=>{if(!detail)restore()},[detail,view,limit,knownIds,restore]);
 useEffect(()=>{saveList()},[view,limit,saveList]);
 const setFilter=useCallback((key:keyof ListView,value:string)=>{changeView(v=>v[key]===value?v:{...v,[key]:value});changeLimit(18)},[]);
 const setLimit=useCallback((value:number|((n:number)=>number))=>changeLimit(n=>typeof value==='function'?value(n):value),[]);
 const openDetail=useCallback((id:string)=>{if(!validTopicId(id)||!known.current?.has(id)||closingRef.current||currentTopic()===id)return;const previous=readEntry(window.history.state);const open=currentTopic();generation.current++;cancelAnimationFrame(frame.current);pendingRestore.current=null;
  if(open){const list=previous?.list??snapshot(live.current.view,live.current.limit,window.scrollY);replaceEntry({version:1,entryId:previous?.entryId??entryId(),kind:'detail',topicId:id,parentListId:previous?.parentListId??null,list},navigationUrl(window.location.href,list.view,id));setDetail(id);return}
  lastFocusId.current=id;const list=snapshot(live.current.view,live.current.limit,window.scrollY,id);const parentId=previous?.kind==='list'?previous.entryId:entryId();replaceEntry({version:1,entryId:parentId,kind:'list',topicId:null,parentListId:null,list},navigationUrl(window.location.href,list.view,null));
  // Only an explicit user opening creates a history entry. No synthetic deep-link base.
  window.history.pushState({[NAV_KEY]:{version:1,entryId:entryId(),kind:'detail',topicId:id,parentListId:parentId,list} satisfies TopicNavigationEntry},'',navigationUrl(window.location.href,list.view,id));setDetail(id);
 },[]);
 const closeDetail=useCallback(()=>{const id=currentTopic();if(!id||closingRef.current)return;const entry=readEntry(window.history.state);if(entry?.kind==='detail'&&entry.topicId===id&&entry.parentListId){closingRef.current=true;setClosing(true);window.history.back();return}
  // A direct link has no proven list predecessor. X/back-to-list must stay in this Site.
  const list=entry?.list??snapshot(live.current.view,live.current.limit,0);replaceEntry({version:1,entryId:entryId(),kind:'list',topicId:null,parentListId:null,list},navigationUrl(window.location.href,list.view,null));sync();
 },[sync]);
 return {view,setFilter,limit,setLimit,detail,openDetail,closeDetail,closing,notice,clearNotice:()=>setNotice(''),onCloseAutoFocus:(event:Event)=>{event.preventDefault();restore()}};
}
