import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ApiProvider } from './context/ApiContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { PageProvider, usePage } from './context/PageContext';
import { HomePage } from './pages/HomePage';
import { ScanPage } from './pages/ScanPage';
import { ReaderPage } from './pages/ReaderPage';
import { LearningPage } from './pages/LearningPage';
import { MissingPage } from './pages/MissingPage';
import {
  clearAllSavedData,
  deleteSavedPage,
  getSavedPage,
  listSavedPages,
  loadSavedPageImage,
  saveLearningSessionLocal,
  savePageLocal,
} from './lib/indexedDb';

const DevFixtureHarness = import.meta.env.DEV
  ? lazy(() => import('./mocks/DevFixtureHarness'))
  : null;

function SavedPageRoute({ renderPage }) {
  const { pageId } = useParams();
  const { page, setActivePage } = usePage();
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if ((page && page.id === pageId) || !pageId) return;
    let cancelled = false;
    setRestoring(true);
    getSavedPage(pageId).then(async (res) => {
      if (cancelled) return;
      if (res.ok && res.item?.page) {
        const blob = res.item.image_key
          ? await loadSavedPageImage(res.item.image_key)
          : null;
        if (cancelled) return;
        const nextSimpCache = {};
        for (const s of res.item.simplifications || []) {
          for (const item of s.items || []) {
            nextSimpCache[`${res.item.page.id}:${item.chunk_id}:${s.level || 'easy'}`] = item;
          }
        }
        setActivePage(res.item.page, blob, {
          readability:
            res.item.page.extraction_warnings?.length > 0 ? 'partial' : 'readable',
          origin: 'saved',
          simplificationCache: nextSimpCache,
          learningSession: res.item.learningSession || null,
        });
      }
      setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [page, pageId, setActivePage]);

  if (restoring && (!page || page.id !== pageId)) {
    return null;
  }
  return renderPage();
}

function MindBridgeRoutes() {
  const navigate = useNavigate();
  const { page, imageBlob, simplificationCache, definitionCache, setActivePage, clearActivePage } =
    usePage();
  const [savedPages, setSavedPages] = useState([]);

  const refreshSavedPages = useCallback(async () => {
    const res = await listSavedPages();
    if (res.ok) {
      setSavedPages(res.items);
    }
  }, []);

  useEffect(() => {
    refreshSavedPages();
  }, [refreshSavedPages]);

  const handleSaveCurrentPage = useCallback(
    async (targetPage) => {
      if (!targetPage) return;
      const simplifications = Object.values(simplificationCache || {}).reduce((acc, item) => {
        if (!item?.chunk_id) return acc;
        acc.push({ page_id: targetPage.id, level: 'easy', items: [item] });
        return acc;
      }, []);
      const definitions = Object.values(definitionCache || {});
      const result = await savePageLocal({
        page: targetPage,
        imageBlob,
        simplifications,
        definitions,
      });
      if (result.ok) {
        await refreshSavedPages();
      }
    },
    [imageBlob, simplificationCache, definitionCache, refreshSavedPages]
  );

  const handleOpenSavedPage = useCallback(
    async (savedEntry) => {
      if (!savedEntry?.page) return;
      let restoredBlob = null;
      if (savedEntry.image_key) {
        restoredBlob = await loadSavedPageImage(savedEntry.image_key);
      }
      const nextSimpCache = {};
      for (const s of savedEntry.simplifications || []) {
        for (const item of s.items || []) {
          nextSimpCache[`${savedEntry.page.id}:${item.chunk_id}:${s.level || 'easy'}`] = item;
        }
      }
      setActivePage(savedEntry.page, restoredBlob, {
        readability:
          savedEntry.page.extraction_warnings?.length > 0 ? 'partial' : 'readable',
        origin: 'saved',
        simplificationCache: nextSimpCache,
        learningSession: savedEntry.learningSession || null,
      });
      navigate(`/read/${savedEntry.page.id}`);
    },
    [setActivePage, navigate]
  );

  const handleDeleteSavedPage = useCallback(
    async (pageIdToDelete) => {
      await deleteSavedPage(pageIdToDelete);
      await refreshSavedPages();
    },
    [refreshSavedPages]
  );

  const handleClearAllSavedData = useCallback(async () => {
    await clearAllSavedData();
    clearActivePage();
    setSavedPages([]);
  }, [clearActivePage]);

  const handleSaveSession = useCallback(
    async (sessionSnapshot) => {
      if (!sessionSnapshot?.page_id) return;
      await saveLearningSessionLocal(sessionSnapshot);
      await refreshSavedPages();
    },
    [refreshSavedPages]
  );

  const isSaved = Boolean(page && savedPages.some((s) => s.page?.id === page.id));

  return (
    <Routes>
      <Route
        path="/"
        element={
          <HomePage
            savedPages={savedPages}
            onOpenSavedPage={handleOpenSavedPage}
            onDeleteSavedPage={handleDeleteSavedPage}
            onClearAllSavedData={handleClearAllSavedData}
          />
        }
      />
      <Route path="/scan" element={<ScanPage />} />
      <Route
        path="/read/:pageId"
        element={
          <SavedPageRoute
            renderPage={() => (
              <ReaderPage
                onSaveCurrentPage={handleSaveCurrentPage}
                isSavedPage={isSaved}
              />
            )}
          />
        }
      />
      <Route
        path="/learn/:pageId/:chunkId"
        element={
          <SavedPageRoute
            renderPage={() => <LearningPage onSaveSession={handleSaveSession} />}
          />
        }
      />
      {import.meta.env.DEV && DevFixtureHarness ? (
        <Route
          path="/__dev/harness"
          element={
            <Suspense fallback={null}>
              <DevFixtureHarness />
            </Suspense>
          }
        />
      ) : null}
      <Route
        path="*"
        element={
          <MissingPage
            title="Page not found"
            description="This address does not match a MindBridge screen. Return to Home or scan a textbook page."
          />
        }
      />
    </Routes>
  );
}

export function AppProviders({ children, apiProps = {} }) {
  return (
    <ApiProvider {...apiProps}>
      <PreferencesProvider>
        <PageProvider>{children}</PageProvider>
      </PreferencesProvider>
    </ApiProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <MindBridgeRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}

export default App;
