import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function AppShell({
  children,
  onOpenSettings = null,
  extraNav = null,
  readingTheme = null,
  stickyBottom = null,
}) {
  return (
    <div
      data-reading-theme={readingTheme || undefined}
      className={`min-h-screen flex flex-col ${
        readingTheme ? 'mb-reading-surface' : 'bg-[#F7F5ED] text-[#20372D]'
      }`}
    >
      <a href="#main-content" className="mb-skip-link">
        Skip to main content
      </a>
      <SiteHeader onOpenSettings={onOpenSettings} extraNav={extraNav} />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
      {stickyBottom}
    </div>
  );
}
