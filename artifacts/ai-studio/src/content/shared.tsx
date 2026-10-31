import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Bookmark } from 'lucide-react';

export const SITE_NAME = '怎么用好AI · 选题库';

export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · 怎么用好AI` : SITE_NAME; }, [title]);
}

export function errorStatus(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

export function errorText(error: unknown, fallback = '请求失败，请稍后重试。'): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail']) if (typeof d[key] === 'string' && d[key]) return d[key] as string;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

export function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const u = new URL(value); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

export function formatTime(value: string | null | undefined, withTime = true): string {
  if (!value) return '尚无记录';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '时间未知';
  return d.toLocaleString('zh-CN', withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export const KIND_LABEL: Record<string, string> = { article: '文章', video: '视频', link: '链接' };

export function ExternalLink({ href, children, className = 'site-btn' }: { href: string | null; children: ReactNode; className?: string }) {
  const safe = httpsUrl(href);
  if (!safe) return null;
  return <a className={className} href={safe} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function StateBox({ title, text, action, testId }: { title: string; text: string; action?: ReactNode; testId?: string }) {
  return <div className="site-state" data-testid={testId}><h2>{title}</h2><p>{text}</p>{action}</div>;
}

export function Skeletons({ n = 5 }: { n?: number }) {
  return <div aria-busy="true" aria-label="正在加载">{Array.from({ length: n }, (_, i) => <div key={i} className="site-skel" />)}</div>;
}

const NAV = [{ href: '/', label: '选题' }, { href: '/results', label: '成果' }];

export function SiteFrame({ children, admin }: { children: ReactNode; admin?: ReactNode }) {
  const [location] = useLocation();
  return <div className="site">
    <a href="#site-main" className="studio-skip">跳到主要内容</a>
    <header className="site-bar"><div className="site-bar-in">
      <Link href="/" className="site-brand" data-testid="link-home">
        <span className="site-brand-mark"><Bookmark size={18} strokeWidth={1.8} fill="currentColor" /></span>
        <span><strong>怎么用好AI</strong><small>选题库 · 成果阅读</small></span>
      </Link>
      <nav className="site-nav" aria-label="主导航">
        {NAV.map(n => {
          const active = n.href === '/' ? location === '/' : location.startsWith(n.href);
          return <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${n.href === '/' ? 'topics' : 'results'}`}>{n.label}</Link>;
        })}
      </nav>
      {admin}
    </div></header>
    <main id="site-main" tabIndex={-1} className="site-main">{children}</main>
    <footer className="site-foot">内容来自公开来源与外部创作，本站只做整理与展示，不代为制作或发布。</footer>
  </div>;
}
