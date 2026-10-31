import { useEffect, useState, type ReactNode } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { zhCN } from '@clerk/localizations';
import { customFetchResponse } from '@workspace/api-client-react';
import { clerkAppearance } from '@/lib/clerk-appearance';
import AdminPage from './admin-page';
import { SiteFrame, Skeletons, StateBox, useTitle } from './shared';

// Loaded lazily: only /admin, /sign-in and /sign-up pull in Clerk.
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const stripBase = (p: string) => (basePath && p.startsWith(basePath) ? p.slice(basePath.length) || '/' : p);

function SignInPage() {
  useTitle('站主登录');
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/admin`} />
  </main>;
}
function SignUpPage() {
  useTitle('注册');
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/admin`} />
  </main>;
}

function SignOutButton() {
  const { signOut } = useClerk();
  return <button type="button" className="site-btn" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">退出登录</button>;
}

type Access = { userId: string; status: 'ready' | 'denied' | 'signin' | 'error' };

function OwnerGate({ children }: { children: ReactNode }) {
  useTitle('站点维护');
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [state, setState] = useState<Access | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) { setState(null); return; }
    const controller = new AbortController();
    setState(null);
    customFetchResponse('/api/studio/access', { cache: 'no-store', signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setState({ userId, status: r.ok ? 'ready' : r.status === 401 ? 'signin' : r.status === 403 ? 'denied' : 'error' }); })
      .catch(() => { if (!controller.signal.aborted) setState({ userId, status: 'error' }); });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, userId, attempt]);

  const signInLink = <a className="site-btn primary" href={`${basePath}/sign-in`} data-testid="link-sign-in">登录</a>;
  if (!isLoaded) return <SiteFrame><Skeletons n={3} /></SiteFrame>;
  if (!isSignedIn) return <SiteFrame><StateBox testId="status-admin-signin" title="站点维护仅限站主" text="请先登录站主账号。公开内容无需登录即可阅读。" action={signInLink} /></SiteFrame>;
  if (!state || state.userId !== userId) return <SiteFrame admin={<SignOutButton />}><Skeletons n={3} /></SiteFrame>;
  if (state.status === 'signin') return <SiteFrame admin={<SignOutButton />}><StateBox testId="status-admin-expired" title="登录状态已失效" text="请重新登录站主账号。" action={signInLink} /></SiteFrame>;
  if (state.status !== 'ready') return <SiteFrame admin={<SignOutButton />}>
    <StateBox testId={state.status === 'denied' ? 'access-denied' : 'access-error'}
      title={state.status === 'denied' ? '此账号没有站主权限' : '暂时无法确认访问权限'}
      text={state.status === 'denied' ? '你已登录，但这个账号不是站主。公开页面仍可正常浏览。' : '请稍后重试。'}
      action={<div className="site-actions" style={{ justifyContent: 'center' }}><button className="site-btn primary" onClick={() => setAttempt(a => a + 1)} data-testid="button-recheck-access">重新检查</button><SignOutButton /></div>} />
  </SiteFrame>;
  return <SiteFrame admin={<SignOutButton />}>{children}</SiteFrame>;
}

function Scoped() {
  const { userId } = useAuth();
  return <Switch key={userId || 'anonymous'}>
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route><OwnerGate><AdminPage /></OwnerGate></Route>
  </Switch>;
}

export default function AdminApp() {
  const [, setLocation] = useLocation();
  if (!clerkPubKey) return <SiteFrame><StateBox title="登录服务未配置" text="缺少 Clerk 公钥，暂时无法进入站点维护。" /></SiteFrame>;
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    signInFallbackRedirectUrl={`${basePath}/admin`} signUpFallbackRedirectUrl={`${basePath}/admin`}
    localization={zhCN}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <Scoped />
  </ClerkProvider>;
}
