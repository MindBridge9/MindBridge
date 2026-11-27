import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../App';
import { ReaderPage } from '../pages/ReaderPage';
import { usePage } from '../context/PageContext';
import { useEffect } from 'react';
import * as api from '../lib/api';
import healthInitial from '../test-data/health.initial.json';
import readSuccess from '../test-data/read.success.json';
import simplifyOmission from '../test-data/simplify.omission.json';
import simplifyNoTerms from '../test-data/simplify.no-terms.json';
import defineSuccess from '../test-data/define.success.json';

function EnabledReader({ pageData }) {
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

const ALL_FLAGS = {
  read: true,
  simplify: true,
  define: true,
  explain: true,
  prepare_understanding: true,
  check_understanding: true,
};

const ALL_HEALTH = {
  ...healthInitial,
  capabilities: {
    read: true,
    simplify: true,
    define: true,
    explain: true,
    prepare_understanding: true,
    check_understanding: true,
  },
};

describe('Glossary, Simplify, and SourceLens', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens initial glossary entry without calling defineTerm', async () => {
    const defineSpy = vi.spyOn(api, 'defineTerm').mockResolvedValue(defineSuccess);

    render(
      <MemoryRouter initialEntries={[`/read/${readSuccess.page.id}`]}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: ALL_FLAGS,
            healthFetcher: () => Promise.resolve(ALL_HEALTH),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<EnabledReader pageData={readSuccess} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    const glossaryChip = await screen.findByRole('button', { name: 'glucose' });
    fireEvent.click(glossaryChip);

    expect(await screen.findByText('A type of sugar.')).toBeInTheDocument();
    expect(defineSpy).not.toHaveBeenCalled();
  });

  it('simplifies selected chunk on demand and displays FactGuard warnings in SourceLens', async () => {
    const customPage = {
      ...readSuccess,
      page: {
        ...readSuccess.page,
        key_terms: [{ term: 'water', chunk_ids: ['c0002'] }],
        chunks: [
          readSuccess.page.chunks[0],
          {
            id: 'c0002',
            kind: 'paragraph',
            text: 'The sample contains 20 mL of water.',
            quality: 'clear',
          },
        ],
      },
    };

    vi.spyOn(api, 'simplify').mockResolvedValue(simplifyOmission);

    render(
      <MemoryRouter initialEntries={[`/read/${customPage.page.id}`]}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: ALL_FLAGS,
            healthFetcher: () => Promise.resolve(ALL_HEALTH),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<EnabledReader pageData={customPage} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    const simplifyBtn = await screen.findByRole('radio', { name: 'Simplified', exact: true });
    fireEvent.click(simplifyBtn);

    await waitFor(() => {
      expect(screen.getByText('The sample contains water.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /open sourcelens/i }));
    expect(await screen.findByText(/FactGuard: possible omissions or changes/i)).toBeInTheDocument();
    expect(screen.getByText(/The number 20 is absent/i)).toBeInTheDocument();
    expect(screen.getByText(/The unit mL is absent/i)).toBeInTheDocument();
  });

  it('labels unavailable terminology check explicitly in SourceLens', async () => {
    vi.spyOn(api, 'simplify').mockResolvedValue(simplifyNoTerms);

    render(
      <MemoryRouter initialEntries={[`/read/${readSuccess.page.id}`]}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: ALL_FLAGS,
            healthFetcher: () => Promise.resolve(ALL_HEALTH),
          }}
        >
          <Routes>
            <Route path="/read/:pageId" element={<EnabledReader pageData={{ ...readSuccess, page: { ...readSuccess.page, key_terms_status: 'unavailable', key_terms: [] } }} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    const simplifyBtn = await screen.findByRole('radio', { name: 'Simplified', exact: true });
    fireEvent.click(simplifyBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open sourcelens/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /open sourcelens/i }));

    expect(
      await screen.findByText(/Key-term metadata was unavailable for this section/i)
    ).toBeInTheDocument();
  });
});
