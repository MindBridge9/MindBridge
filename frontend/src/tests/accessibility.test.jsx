import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../App';
import { HomePage } from '../pages/HomePage';
import { ScanPage } from '../pages/ScanPage';
import { MissingPage } from '../pages/MissingPage';
import healthInitial from '../../../docs/fixtures/health.initial.json';

describe('Accessibility and landmark structure', () => {
  it('exposes skip link, primary navigation, main landmark, and h1 on HomePage and ScanPage', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppProviders apiProps={{ healthFetcher: () => Promise.resolve(healthInitial) }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Server connected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#main-content'
    );
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders honest recovery actions on MissingPage without invented routes', () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <AppProviders apiProps={{ skipInitialHealthCheck: true }}>
          <Routes>
            <Route path="*" element={<MissingPage />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /scan a textbook page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
  });
});
