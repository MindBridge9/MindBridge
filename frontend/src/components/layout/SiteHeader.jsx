import { Link, useLocation } from 'react-router-dom';
import { Camera, SlidersHorizontal } from 'lucide-react';
import { BrandLogo, Button } from '../common';

export function SiteHeader({ onOpenSettings = null, extraNav = null }) {
  const location = useLocation();
  const isScan = location.pathname === '/scan';

  return (
    <header className="mb-chrome-header sticky top-0 z-30 border-b">
      <div className="mb-shell-container flex min-h-[64px] items-center justify-between gap-3 py-2">
        <Link
          to="/"
          className="inline-flex items-center min-h-[44px] pr-2 no-underline rounded-[6px] text-inherit"
          aria-label="MindBridge home"
        >
          <BrandLogo size={28} />
        </Link>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {extraNav}
          {!isScan ? (
            <Link
              to="/scan"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-[6px] bg-[#204C43] text-white text-[14px] font-semibold no-underline hover:bg-[#193C35] transition-colors duration-150"
            >
              <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Scan page</span>
            </Link>
          ) : null}
          {onOpenSettings ? (
            <Button
              variant="secondary"
              size="sm"
              icon={SlidersHorizontal}
              onClick={onOpenSettings}
            >
              Reading settings
            </Button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
