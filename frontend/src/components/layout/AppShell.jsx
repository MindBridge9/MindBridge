import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { usePreferences } from '../../context/PreferencesContext';
import { useApi } from '../../context/ApiContext';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function AppShell({
  children,
  onOpenSettings = null,
  extraNav = null,
  readingTheme = null,
  stickyBottom = null,
}) {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  const { releaseFlags } = useApi();
  const { preferences } = usePreferences();
  useEffect(() => {
    const pointer = () => { document.documentElement.dataset.input = 'pointer'; };
    const keyboard = () => { document.documentElement.dataset.input = 'keyboard'; };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', keyboard, true); };
  }, []);
  return (
    <div
      data-reading-theme={readingTheme || preferences.theme}
      className={`mb-app min-h-screen flex flex-col ${
        readingTheme ? 'mb-reading-surface' : 'bg-[var(--mb-bg)] text-[var(--mb-text)]'
      }`}
    >
      <a href="#main-content" className="mb-skip-link">
        Skip to main content
      </a>
      <span id="mb-scroll-origin" aria-hidden="true" className="mb-scroll-origin" />
      <SiteHeader onOpenSettings={onOpenSettings} extraNav={extraNav} />
      {import.meta.env.DEV && releaseFlags.check_understanding ? <p className="mb-development-notice">Development integration · synthetic, nonpersonal input only. Learning quality acceptance remains open.</p> : null}
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
      {stickyBottom}
    </div>
  );
}
