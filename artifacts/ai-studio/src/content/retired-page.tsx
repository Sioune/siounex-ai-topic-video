import { Link } from 'wouter';
import { StateBox, useTitle } from './shared';

export function RetiredPage() {
  useTitle('页面已停用');
  return <StateBox testId="status-retired" title="这个页面已经停用"
    text="本站不再提供制作、发布或数据工作台。外部完成的作品统一在成果页阅读。"
    action={<div className="site-actions" style={{ justifyContent: 'center' }}>
      <Link href="/results" className="site-btn primary" data-testid="link-retired-results">前往成果</Link>
      <Link href="/" className="site-btn" data-testid="link-retired-topics">浏览选题</Link>
    </div>} />;
}

export function NotFoundPage() {
  useTitle('页面不存在');
  return <StateBox testId="status-not-found" title="没有找到这个页面" text="链接可能有误。"
    action={<Link href="/" className="site-btn primary" data-testid="link-notfound-home">回到选题</Link>} />;
}
