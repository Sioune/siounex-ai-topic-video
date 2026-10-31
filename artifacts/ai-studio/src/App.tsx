import { useEffect, useState, type ReactNode } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation, useSearch } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { zhCN } from '@clerk/localizations';
import { customFetchResponse } from '@workspace/api-client-react';
import AppFrame from '@/components/app-frame';
import WorkspaceLoading from '@/components/workspace-loading';
import Workspace from '@/app/workspace';
import DataCenter from '@/components/data-center';
import MobileDataUpload from '@/components/mobile-data-upload';
import ProductionDesk from '@/components/production-desk';
import ResearchDesk from '@/components/research-desk';
import OriginalDesk from '@/components/original-desk';
import PublishingCenter from '@/components/publishing-center';
import { Button } from '@/components/ui/button';
import { clerkAppearance } from '@/lib/clerk-appearance';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

function SignInPage() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
  </main>;
}
function SignUpPage() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
  </main>;
}

function UploadRoute() {
  const params = new URLSearchParams(useSearch());
  return <MobileDataUpload collectionId={(params.get('collection') || '').slice(0, 200)} />;
}
function Routes() {
  return <Switch>
    <Route path="/"><Workspace initial={null} deferInitialLoad /></Route>
    <Route path="/data/upload" component={UploadRoute} />
    <Route path="/data" component={DataCenter} />
    <Route path="/production" component={ProductionDesk} />
    <Route path="/research" component={ResearchDesk} />
    <Route path="/originals" component={OriginalDesk} />
    <Route path="/publishing" component={PublishingCenter} />
    <Route><Workspace initial={null} deferInitialLoad /></Route>
  </Switch>;
}

// This gate resolves local authorization only after Clerk finishes loading.
// Signed-in 401/403 is terminal; it must never redirect back to sign-in.
function Gate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const [state, setState] = useState<{ userId: string; status: 'ready' | 'denied' | 'error' } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) { setState(null); return; }
    const controller = new AbortController();
    setState(null);
    customFetchResponse('/api/studio/access', { cache: 'no-store', signal: controller.signal })
      .then(r => {
        if (controller.signal.aborted) return;
        setState({ userId, status: r.ok ? 'ready' : [401, 403].includes(r.status) ? 'denied' : 'error' });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ userId, status: 'error' }); });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, userId, attempt]);
  if (!isLoaded) return <WorkspaceLoading />;
  if (!isSignedIn) return <main className="min-h-[100dvh] flex items-center justify-center px-6">
    <section className="w-full max-w-sm rounded-xl border bg-card p-8 text-card-foreground">
      <h1 className="text-xl font-semibold">怎么用好AI · 选题库</h1>
      <p className="mt-2 text-sm text-muted-foreground">这是私人选题工作台，仅限站点所有者登录后使用。</p>
      <Button asChild className="mt-6"><a href={`${basePath}/sign-in`}>登录</a></Button>
    </section>
  </main>;
  if (!state || state.userId !== userId) return <WorkspaceLoading />;
  if (state.status !== 'ready') return <main className="min-h-[100dvh] flex items-center justify-center px-6">
    <section data-testid={state.status === 'denied' ? 'access-denied' : 'access-error'} className="w-full max-w-sm rounded-xl border bg-card p-8 text-card-foreground">
      <h1 className="text-xl font-semibold">{state.status === 'denied' ? '此账号没有站主权限' : '暂时无法确认访问权限'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{state.status === 'denied' ? '你已登录，但尚未获得私人工作台的访问权限。请联系站主完成安全配置。' : '请稍后重试。'}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => setAttempt(a => a + 1)}>重新检查</Button>
        <Button variant="outline" onClick={() => signOut({ redirectUrl: basePath || "/" })}>退出登录</Button>
      </div>
    </section>
  </main>;
  return <>{children}</>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    signInFallbackRedirectUrl={basePath || "/"}
    signUpFallbackRedirectUrl={basePath || "/"}
    localization={zhCN}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <IdentityScopedRoutes />
  </ClerkProvider>;
}

function IdentityScopedRoutes() {
  const { userId } = useAuth();
  // Remount all page-local caches when the account changes, including sign-out.
  return <Switch key={userId || 'anonymous'}>
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route><Gate><AppFrame><Routes /></AppFrame></Gate></Route>
  </Switch>;
}

export default function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
