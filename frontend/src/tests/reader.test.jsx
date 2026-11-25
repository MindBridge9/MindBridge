import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../App';
import { ReaderPage } from '../pages/ReaderPage';
import { usePage } from '../context/PageContext';
import { useEffect } from 'react';
import readPartial from '../../../docs/fixtures/read.partial.json';
import readUnavailable from '../../../docs/fixtures/read.enrichment-unavailable.json';
import healthInitial from '../../../docs/fixtures/health.initial.json';

function SeededReader({ pageData }) {
  const { setActivePage } = usePage();
  useEffect(() => {
    setActivePage(pageData.page, null, {
      readability: pageData.readability,
      retakeReasons: pageData.retake_reasons,
      origin: 'live',
    });
  }, [pageData, setActivePage]);
  return <ReaderPage />;
}

describe('Accessible Reader, MissingPage, and ReadingSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders semantic original chunks, partial warning, and unavailable summary honestly', async () => {
    render(
      <MemoryRouter initialEntries={[`/read/${readPartial.page.id}`]}>
        <AppProviders
          apiProps={{
            healthFetcher: () => Promise.resolve(healthInitial),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<SeededReader pageData={readPartial} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Partial extraction/i)).toBeInTheDocument();
    expect(screen.getByText(/Uncertain text — verify photo/i)).toBeInTheDocument();
    expect(screen.getByText(/The caption is cut off/i)).toBeInTheDocument();
    expect(screen.getByText('The leaf')).toBeInTheDocument();
  });

  it('shows Summary unavailable when summary is null', async () => {
    render(
      <MemoryRouter initialEntries={[`/read/${readUnavailable.page.id}`]}>
        <AppProviders
          apiProps={{
            healthFetcher: () => Promise.resolve(healthInitial),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<SeededReader pageData={readUnavailable} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Summary unavailable for this page/i)
    ).toBeInTheDocument();
  });

  it('opens ReadingSettingsDialog, updates CSS variables immediately, and resets on request', async () => {
    render(
      <MemoryRouter initialEntries={[`/read/${readPartial.page.id}`]}>
        <AppProviders
          apiProps={{
            healthFetcher: () => Promise.resolve(healthInitial),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<SeededReader pageData={readPartial} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    const settingsBtn = await screen.findByRole('button', { name: /reading settings/i });
    fireEvent.click(settingsBtn);

    const dialog = await screen.findByRole('dialog', { name: /reading settings/i });
    expect(dialog).toBeInTheDocument();

    const darkRadio = screen.getByRole('radio', { name: 'Dark' });
    fireEvent.click(darkRadio);
    expect(darkRadio).toHaveAttribute('aria-checked', 'true');

    const sizeSlider = screen.getByLabelText(/text size/i);
    fireEvent.change(sizeSlider, { target: { value: '26' } });
    expect(document.documentElement.style.getPropertyValue('--mb-reading-size')).toBe('26px');

    fireEvent.click(screen.getByRole('button', { name: /reset defaults/i }));
    expect(document.documentElement.style.getPropertyValue('--mb-reading-size')).toBe('20px');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /reading settings/i })).not.toBeInTheDocument();
  });

  it('renders MissingPage recovery when page is absent in memory', async () => {
    render(
      <MemoryRouter initialEntries={['/read/missing-id']}>
        <AppProviders
          apiProps={{
            healthFetcher: () => Promise.resolve(healthInitial),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<ReaderPage />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Page not available in this session/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan a textbook page/i })).toBeInTheDocument();
  });
});
