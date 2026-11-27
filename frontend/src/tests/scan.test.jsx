import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../App';
import { HomePage } from '../pages/HomePage';
import { ScanPage } from '../pages/ScanPage';
import { ReaderPage } from '../pages/ReaderPage';
import { validateImageFileMetadata, ImageValidationError } from '../lib/image';
import * as api from '../lib/api';
import healthInitial from '../test-data/health.initial.json';
import readSuccess from '../test-data/read.success.json';
import readUnreadable from '../test-data/read.unreadable.json';

function enabledFlags() {
  return {
    read: true,
    simplify: true,
    define: true,
    explain: true,
    prepare_understanding: true,
    check_understanding: true,
  };
}

function enabledHealth() {
  return {
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
}

describe('Image validation & ScanPage flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  it('rejects HEIC and oversized files with clear messages', () => {
    const heic = new File(['abc'], 'photo.heic', { type: 'image/heic' });
    expect(() => validateImageFileMetadata(heic)).toThrow(ImageValidationError);
    expect(() => validateImageFileMetadata(heic)).toThrow(/HEIC/i);

    const huge = new File(['abc'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 });
    expect(() => validateImageFileMetadata(huge)).toThrow(/20 MiB/i);
  });

  it('opens the labelled Preprocessed sample from HomePage', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: enabledFlags(),
            healthFetcher: () => Promise.resolve(enabledHealth()),
          }}
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/read/:pageId" element={<ReaderPage />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    const sampleBtn = await screen.findByRole('button', { name: /try a sample/i });
    fireEvent.click(sampleBtn);

    expect(await screen.findByText(/Preprocessed sample page/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Photosynthesis' })).toBeInTheDocument();
  });

  it('keeps user on ScanPage with retake guidance when OCR returns unreadable, and navigates on readable', async () => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 1000,
      height: 1400,
      close: vi.fn(),
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const readSpy = vi
      .spyOn(api, 'readPage')
      .mockResolvedValueOnce(readUnreadable)
      .mockResolvedValueOnce(readSuccess);

    render(
      <MemoryRouter initialEntries={['/scan']}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: enabledFlags(),
            healthFetcher: () => Promise.resolve(enabledHealth()),
          }}
        >
          <Routes>
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/read/:pageId" element={<ReaderPage />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    const galleryInput = document.getElementById('scan-gallery-input');
    const file = new File(['fake-jpeg'], 'textbook.jpg', { type: 'image/jpeg' });
    fireEvent.change(galleryInput, { target: { files: [file] } });

    const confirmBtn = await screen.findByRole('button', { name: /read this page/i });
    expect(screen.getByText(/Groq or Google Gemini/i)).toBeInTheDocument();
    fireEvent.click(confirmBtn);

    expect(
      await screen.findByText(/This photograph could not be read clearly enough/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Text looks blurred/i)).toBeInTheDocument();

    // Second attempt succeeds and opens ReaderPage
    fireEvent.click(screen.getByRole('button', { name: /read this page/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Photosynthesis' })).toBeInTheDocument();
    });
    expect(readSpy).toHaveBeenCalledTimes(2);
  });
});
