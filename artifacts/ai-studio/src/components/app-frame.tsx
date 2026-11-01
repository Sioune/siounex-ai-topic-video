'use client';

import {useEffect,useRef,useState} from 'react';
import {useClerk} from '@clerk/react';
import {useLocation} from 'wouter';
import {ThemeProvider,useTheme} from 'next-themes';
import {Bookmark,BookOpen,ChartNoAxesCombined,ChevronRight,Clapperboard,FileSearch,FilePenLine,Keyboard,LockKeyhole,Monitor,Search,Send,Type} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from './ui/command';

const navigation=[
 {href:'/',label:'选题库',description:'发现下一条值得拍的故事',icon:BookOpen},
 {href:'/research',label:'关键词研究',description:'从关键词和视频线索整理带来源资料稿',icon:FileSearch},
 {href:'/originals',label:'本人原创',description:'保存本人产品说明、完整原文和报道草稿',icon:FilePenLine},
 {href:'/production',label:'制作与审稿',description:'查看稿件、视频与审核待办',icon:Clapperboard},
 {href:'/publishing',label:'发布中心',description:'安排四平台发布，跟踪真实回执与采集',icon:Send},
 {href:'/data',label:'数据中心',description:'记录表现，复盘创作',icon:ChartNoAxesCombined},
];

function Frame({children}:{children:React.ReactNode}){
 const {signOut}=useClerk();
 const [location]=useLocation(),pathname=location||'/';
 const current=navigation.find(item=>item.href==='/'?pathname==='/':pathname.startsWith(item.href))||navigation[0];
 const [commandOpen,setCommandOpen]=useState(false),[large,setLarge]=useState(false),[ready,setReady]=useState(false);
 const quickOpen=useRef<HTMLButtonElement>(null),commandOrigin=useRef<HTMLElement|null>(null);
 const {theme,resolvedTheme,setTheme}=useTheme();
 useEffect(()=>{setReady(true);try{setLarge(localStorage.getItem('siounex-reading-size')==='large')}catch{}},[]);
 // Native navigation activates beforeunload. Protect modified editor/form fields;
 // searches and sidebar controls do not represent unsaved form submissions.
 useEffect(()=>{type Field=HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;const initial=new WeakMap<Field,string>(),changed=new Set<Field>();const value=(field:Field)=>field instanceof HTMLInputElement&&(field.type==='checkbox'||field.type==='radio')?String(field.checked):field.value;const field=(target:EventTarget|null):Field|null=>{if(!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement)||!target.closest('#studio-main,[role=dialog]')||target.disabled||target instanceof HTMLInputElement&&target.type==='search'||!(target instanceof HTMLTextAreaElement)&&!target.closest('form'))return null;return target};const focus=(event:Event)=>{const target=field(event.target);if(target&&!changed.has(target))initial.set(target,value(target))};const update=(event:Event)=>{const target=field(event.target);if(!target)return;if(!initial.has(target)){const original=target instanceof HTMLInputElement&&(target.type==='checkbox'||target.type==='radio')?String(target.defaultChecked):target instanceof HTMLSelectElement?target.value:target.defaultValue;initial.set(target,original)}if(value(target)!==initial.get(target))changed.add(target);else changed.delete(target)};const saved=(event:Event)=>{const form=(event as CustomEvent).detail;if(!(form instanceof HTMLFormElement))return;for(const target of changed)if(form.contains(target))changed.delete(target)};const guard=(event:BeforeUnloadEvent)=>{for(const target of changed){if(target.isConnected&&value(target)!==initial.get(target)){event.preventDefault();event.returnValue='';return}changed.delete(target)}};document.addEventListener('studio:form-saved',saved);document.addEventListener('focusin',focus);document.addEventListener('input',update);document.addEventListener('change',update);window.addEventListener('beforeunload',guard);return()=>{document.removeEventListener('studio:form-saved',saved);document.removeEventListener('focusin',focus);document.removeEventListener('input',update);document.removeEventListener('change',update);window.removeEventListener('beforeunload',guard)}},[]);
 useEffect(()=>{if(!ready)return;document.documentElement.dataset.reading=large?'large':'comfortable';try{localStorage.setItem('siounex-reading-size',large?'large':'comfortable')}catch{}},[large,ready]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(!event.isComposing&&(event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='k'){event.preventDefault();setCommandOpen(value=>{if(!value)commandOrigin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;return !value})}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
 function openCommand(){commandOrigin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setCommandOpen(true)}
 // The current page initializes its own search state on mount. Reopen it as a
 // document when the user explicitly chooses the same top-level destination.
 function navigate(href:string){setCommandOpen(false);window.location.assign(href)}
 const brandContent=<><span className="studio-brand-mark"><Bookmark size={23} strokeWidth={1.8} fill="currentColor"/></span><span><strong>怎么用好AI</strong><small>视频创作工作台</small></span></>;
 return <div className="studio-shell">
  <a href="#studio-main" className="studio-skip">跳到主要内容</a>
  <aside className="studio-sidebar" aria-label="工作区导航">
   <a className="studio-brand" href="/" aria-label="怎么用好AI，返回选题库">{brandContent}</a>
   <div className="studio-nav-label">工作空间</div>
   <nav>{navigation.map(item=>{const Icon=item.icon;return <a key={item.href} href={item.href} aria-current={current.href===item.href?'page':undefined}><Icon size={19} strokeWidth={1.75}/><span>{item.label}</span>{current.href===item.href&&<ChevronRight size={15}/>}</a>})}</nav>
   <div className="studio-sidebar-bottom"><div className="studio-reading"><Type size={19} strokeWidth={1.75}/><span>阅读设置</span></div>
    <button className="studio-reading-toggle" type="button" aria-label="大字模式" aria-pressed={large} onClick={()=>setLarge(value=>!value)}><span>大字模式</span><span className="studio-switch" aria-hidden="true"><i/></span></button>
    <label className="studio-theme"><Monitor size={17} strokeWidth={1.75}/><span className="sr-only">界面主题</span><select aria-label="界面主题" value={ready?theme||'system':'system'} onChange={event=>setTheme(event.target.value)}><option value="system">跟随系统外观</option><option value="light">浅色外观</option><option value="dark">深色外观</option></select></label>
    <p className="studio-privacy"><LockKeyhole size={13}/><span>个人工作空间，仅你可见</span></p>
    <button type="button" className="studio-reading-toggle" onClick={()=>signOut({redirectUrl:import.meta.env.BASE_URL})}>退出登录</button>
   </div>
  </aside>
  <div className="studio-body">
   <header className="studio-topbar"><div className="studio-breadcrumb"><span>创作工作台</span><ChevronRight size={14}/><strong>{current.label}</strong></div><button type="button" className="studio-quick-open" ref={quickOpen} onClick={openCommand} aria-label="快速跳转（Ctrl K）"><Search size={16}/><span>快速跳转</span><kbd>Ctrl K</kbd></button></header>
   <div id="studio-main" tabIndex={-1} className="studio-content">{children}</div>
  </div>
  <Dialog open={commandOpen} onOpenChange={setCommandOpen}><DialogContent className="studio-command" onCloseAutoFocus={event=>{event.preventDefault();const target=commandOrigin.current?.isConnected?commandOrigin.current:quickOpen.current;target?.focus({preventScroll:true});}}><DialogHeader><DialogTitle>快速跳转</DialogTitle><DialogDescription>前往工作区，或调整阅读方式。</DialogDescription></DialogHeader><Command><CommandInput aria-label="搜索页面或操作" placeholder="搜索页面或操作…"/><CommandList><CommandEmpty>没有匹配的操作。</CommandEmpty><CommandGroup heading="工作区">{navigation.map(item=>{const Icon=item.icon;return <CommandItem key={item.href} value={item.label+' '+item.description} onSelect={()=>navigate(item.href)}><Icon size={18}/><div><strong>{item.label}</strong><small>{item.description}</small></div><ChevronRight size={15}/></CommandItem>})}</CommandGroup><CommandGroup heading="阅读"><CommandItem value="大字 字号 阅读" onSelect={()=>{setLarge(value=>!value);setCommandOpen(false)}}><Type size={18}/>{large?'恢复舒适字号':'打开大字模式'}</CommandItem><CommandItem value="主题 深色 浅色 夜间" onSelect={()=>{setTheme(resolvedTheme==='dark'?'light':'dark');setCommandOpen(false)}}><Monitor size={18}/>{resolvedTheme==='dark'?'切换浅色外观':'切换深色外观'}</CommandItem></CommandGroup></CommandList><div className="studio-command-hint"><Keyboard size={14}/>用方向键选择，回车打开，Esc 关闭</div></Command></DialogContent></Dialog>
 </div>;
}

export default function AppFrame({children}:{children:React.ReactNode}){return <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="siounex-studio-theme" disableTransitionOnChange><Frame>{children}</Frame></ThemeProvider>;}
