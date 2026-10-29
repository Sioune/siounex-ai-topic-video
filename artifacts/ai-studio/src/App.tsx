import { useEffect, useState, type ReactNode } from 'react';
import { Route, Switch, Router as WouterRouter, useSearch } from 'wouter';
import { LockKeyhole } from 'lucide-react';
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

type AuthUser = { userId: string; displayName: string };
type AuthState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; user: AuthUser | null };

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetch('/api/auth/user', { credentials: 'include', cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d: { user: AuthUser | null }) => { if (alive) setState({ status: 'ready', user: d?.user ?? null }); })
      .catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, [attempt]);
  return { state, retry: () => setAttempt(a => a + 1) };
}

function SignIn({ error, onRetry }: { error?: boolean; onRetry: () => void }) {
  const returnTo = window.location.pathname + window.location.search;
  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6">
      <section className="w-full max-w-sm rounded-xl border bg-card p-8 text-card-foreground">
        <LockKeyhole size={22} strokeWidth={1.75} aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">怎么用好AI · 选题库</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ? '暂时无法确认登录状态，请稍后重试。' : '这是私人选题工作台，仅限站点所有者登录后使用。'}
        </p>
        <div className="mt-6 flex gap-2">
          {error ? (
            <Button onClick={onRetry}>重试</Button>
          ) : (
            <Button asChild><a href={'/api/login?returnTo=' + encodeURIComponent(returnTo)}>登录</a></Button>
          )}
        </div>
      </section>
    </main>
  );
}

function UploadRoute() {
  const params = new URLSearchParams(useSearch());
  const collection = (params.get('collection') || '').slice(0, 200);
  return <MobileDataUpload collectionId={collection} />;
}

function Routes() {
  return (
    <Switch>
      <Route path="/"><Workspace initial={null} deferInitialLoad /></Route>
      <Route path="/data/upload" component={UploadRoute} />
      <Route path="/data" component={DataCenter} />
      <Route path="/production" component={ProductionDesk} />
      <Route path="/research" component={ResearchDesk} />
      <Route path="/originals" component={OriginalDesk} />
      <Route path="/publishing" component={PublishingCenter} />
      <Route><Workspace initial={null} deferInitialLoad /></Route>
    </Switch>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { state, retry } = useAuth();
  if (state.status === 'loading') return <WorkspaceLoading />;
  if (state.status === 'error') return <SignIn error onRetry={retry} />;
  if (!state.user) return <SignIn onRetry={retry} />;
  return <>{children}</>;
}

function App() {
  return (
    <WouterRouter base={base}>
      <Gate>
        <AppFrame><Routes /></AppFrame>
      </Gate>
    </WouterRouter>
  );
}

export default App;
