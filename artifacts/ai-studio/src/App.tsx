import { lazy, Suspense } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import TopicsPage from '@/content/topics-page';
import ResultsPage from '@/content/results-page';
import ResultPage from '@/content/result-page';
import { NotFoundPage, RetiredPage } from '@/content/retired-page';
import { SiteFrame, Skeletons } from '@/content/shared';

// Clerk is only loaded for owner routes; public pages make no auth requests.
const AdminApp = lazy(() => import('@/content/admin-auth'));
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const RETIRED = ['/production', '/publishing', '/research', '/originals', '/data'];

function PublicRoutes() {
  return <SiteFrame><Switch>
    <Route path="/" component={TopicsPage} />
    <Route path="/results" component={ResultsPage} />
    <Route path="/results/:id" component={ResultPage} />
    {RETIRED.map(p => <Route key={p} path={`${p}/*?`} component={RetiredPage} />)}
    <Route component={NotFoundPage} />
  </Switch></SiteFrame>;
}

function App() {
  return <WouterRouter base={basePath}>
    <Switch>
      {['/admin/*?', '/sign-in/*?', '/sign-up/*?'].map(p => <Route key={p} path={p}>
        <Suspense fallback={<SiteFrame><Skeletons n={3} /></SiteFrame>}><AdminApp /></Suspense>
      </Route>)}
      <Route><PublicRoutes /></Route>
    </Switch>
  </WouterRouter>;
}

export default App;
