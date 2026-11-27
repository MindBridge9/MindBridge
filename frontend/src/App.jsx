import { MotionSystem } from './components/motion/MotionSystem';
import { Suspense, lazy, useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Route, Routes, useParams, useBlocker, useLocation } from 'react-router-dom';
import { Button, Dialog } from './components/common';
import { ApiProvider } from './context/ApiContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { PageProvider, usePage } from './context/PageContext';
import { HomePage } from './pages/HomePage';
import { ScanPage } from './pages/ScanPage';
import { ReaderPage } from './pages/ReaderPage';
import { LearningPage } from './pages/LearningPage';
import { MissingPage } from './pages/MissingPage';
const DevFixtureHarness = import.meta.env.DEV
  ? lazy(() => import('./mocks/DevFixtureHarness'))
  : null;

function ActiveLearningRoute() {
  const { pageId, chunkId } = useParams();
  return <LearningPage key={`${pageId}:${chunkId}`} />;
}

function MindBridgeRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/read/:pageId" element={<ReaderPage />} />
      <Route path="/learn/:pageId/:chunkId" element={<ActiveLearningRoute />} />
      {import.meta.env.DEV && DevFixtureHarness ? (
        <Route path="/__dev/harness" element={<Suspense fallback={null}><DevFixtureHarness /></Suspense>} />
      ) : null}
      <Route path="*" element={<MissingPage title="Page not found" description="Return home or scan a textbook page to continue." />} />
    </Routes>
  );
}

export function AppProviders({ children, apiProps = {} }) {
  return (
    <ApiProvider {...apiProps}>
      <PreferencesProvider>
        <PageProvider><MotionSystem>{children}</MotionSystem></PageProvider>
      </PreferencesProvider>
    </ApiProvider>
  );
}

function SessionNavigationGuard() {
  const { learningSession, setLearningSession } = usePage();
  const location = useLocation();
  const belongsToSession = (pathname) => learningSession && (
    pathname === `/read/${learningSession.page_id}` ||
    pathname === `/learn/${learningSession.page_id}/${learningSession.chunk_id}`
  );
  const blocker = useBlocker(({ nextLocation }) => Boolean(
    learningSession?.plan && learningSession.stage !== 'results' && !belongsToSession(nextLocation.pathname)
  ));
  useEffect(() => {
    if (learningSession && !belongsToSession(location.pathname)) setLearningSession(null);
  }, [location.pathname, learningSession, setLearningSession]);
  useEffect(() => {
    if (!learningSession?.plan || learningSession.stage === 'results') return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [learningSession?.plan, learningSession?.stage]);
  return <Dialog open={blocker.state === 'blocked'} title="Leave unfinished practice?" description="Leaving clears this practice and its answer draft. Your current textbook page stays open." onClose={() => blocker.reset?.()} footer={
    <><Button variant="secondary" onClick={() => blocker.reset?.()}>Keep practicing</Button><Button variant="destructive" onClick={() => { setLearningSession(null); blocker.proceed?.(); }}>Leave practice</Button></>
  }><p className="m-0">You can return to the reader and resume this practice without losing your draft.</p></Dialog>;
}

function ApplicationRoot() {
  return <AppProviders><SessionNavigationGuard /><MindBridgeRoutes /></AppProviders>;
}

export function App() {
  const router = useMemo(() => createBrowserRouter([{ path: '*', element: <ApplicationRoot /> }]), []);
  return <RouterProvider router={router} />;
}

export default App;
