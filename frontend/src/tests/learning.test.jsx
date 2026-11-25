import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../App';
import { LearningPage } from '../pages/LearningPage';
import { ReaderPage } from '../pages/ReaderPage';
import { usePage } from '../context/PageContext';
import { useEffect } from 'react';
import * as api from '../lib/api';
import healthInitial from '../../../docs/fixtures/health.initial.json';
import readSuccess from '../../../docs/fixtures/read.success.json';
import prepareSuccess from '../../../docs/fixtures/prepare.success.json';
import checkMisconception from '../../../docs/fixtures/check.misconception.json';
import checkUncertain from '../../../docs/fixtures/check.uncertain.json';
import retrySuccess from '../../../docs/fixtures/retry.independent-success.json';
import retryNarrow from '../../../docs/fixtures/retry.narrow.json';

function SeededLearning({ pageData }) {
  const { setActivePage } = usePage();
  useEffect(() => {
    setActivePage(pageData.page, null, {
      readability: pageData.readability,
      retakeReasons: pageData.retake_reasons,
      origin: 'live',
    });
  }, [pageData, setActivePage]);
  return <LearningPage />;
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

function echoAttempt(fixture, sentPayload) {
  return {
    ...fixture,
    attempt: {
      ...fixture.attempt,
      id: sentPayload.attempt_id,
      plan_id: sentPayload.plan.id,
      question: sentPayload.question,
      answer: sentPayload.answer,
      assistance: sentPayload.assistance,
    },
    retry_result: fixture.retry_result
      ? {
          ...fixture.retry_result,
          previous_attempt_id: sentPayload.previous_attempt?.id || fixture.retry_result.previous_attempt_id,
          current_attempt_id: sentPayload.attempt_id,
          independent_in_app: !sentPayload.assistance.used,
        }
      : null,
  };
}

describe('Learning loop: prepare, uncertain recovery, misconception repair, retry, and results', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects blank submission, recovers from uncertain response, repairs misconception, and completes independent retry', async () => {
    vi.spyOn(api, 'prepareUnderstanding').mockResolvedValue(prepareSuccess);
    const checkSpy = vi.spyOn(api, 'checkUnderstanding').mockImplementation(async (payload) => {
      if (checkSpy.mock.calls.length === 1) {
        return echoAttempt(checkUncertain, payload);
      }
      if (checkSpy.mock.calls.length === 2) {
        return echoAttempt(checkMisconception, payload);
      }
      return echoAttempt(retrySuccess, payload);
    });

    render(
      <MemoryRouter initialEntries={[`/learn/${readSuccess.page.id}/c0002`]}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: ALL_FLAGS,
            healthFetcher: () => Promise.resolve(ALL_HEALTH),
          }}
        >
          <Routes>
            <Route path="/learn/:pageId/:chunkId" element={<SeededLearning pageData={readSuccess} />} />
            <Route path="/read/:pageId" element={<ReaderPage />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    // Wait for prepared initial question
    expect(
      await screen.findByText(prepareSuccess.initial_question.text)
    ).toBeInTheDocument();

    // Blank submission rejected locally
    fireEvent.click(screen.getByRole('button', { name: /check understanding/i }));
    expect(
      await screen.findByText(/Write an explanation in your own words before submitting/i)
    ).toBeInTheDocument();
    expect(checkSpy).not.toHaveBeenCalled();

    // First submission returns uncertain -> allows edit & resubmit with draft intact
    const textarea = screen.getByLabelText(/your explanation/i);
    fireEvent.change(textarea, { target: { value: 'It works somehow.' } });
    fireEvent.click(screen.getByRole('button', { name: /check understanding/i }));

    expect(await screen.findByText(/Clarify your explanation/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /edit and resubmit answer/i }));
    expect(screen.getByLabelText(/your explanation/i)).toHaveValue('It works somehow.');

    // Second submission returns misconception repair + follow-up question
    fireEvent.change(screen.getByLabelText(/your explanation/i), {
      target: { value: 'Plants get their food directly from sunlight.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check understanding/i }));

    expect(await screen.findByText(/Possible misconception/i)).toBeInTheDocument();
    expect(screen.getByText(/Not yet included/i)).toBeInTheDocument();

    // Start retry
    fireEvent.click(screen.getByRole('button', { name: /try follow-up question/i }));
    expect(
      await screen.findByText(checkMisconception.attempt.feedback.follow_up_question.text)
    ).toBeInTheDocument();

    // Submit independent retry
    fireEvent.change(screen.getByLabelText(/your explanation/i), {
      target: { value: 'Sunlight provides energy. Plants use water and carbon dioxide to make glucose.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit retry answer/i }));

    expect(await screen.findByText(/Understanding comparison/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Completed without in-app help during retry/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Newly demonstrated on retry/i)).toBeInTheDocument();

    // Return to Original reading
    fireEvent.click(screen.getByRole('button', { name: /return to original reading/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Photosynthesis' })).toBeInTheDocument();
    });
  });

  it('tracks sticky assistance when help is opened during retry and displays not_retested separately', async () => {
    vi.spyOn(api, 'prepareUnderstanding').mockResolvedValue(prepareSuccess);
    const checkSpy = vi.spyOn(api, 'checkUnderstanding').mockImplementation(async (payload) => {
      if (checkSpy.mock.calls.length === 1) {
        return echoAttempt(checkMisconception, payload);
      }
      return echoAttempt(retryNarrow, payload);
    });

    render(
      <MemoryRouter initialEntries={[`/learn/${readSuccess.page.id}/c0002`]}>
        <AppProviders
          apiProps={{
            initialReleaseFlags: ALL_FLAGS,
            healthFetcher: () => Promise.resolve(ALL_HEALTH),
          }}
        >
          <Routes>
            <Route path="/learn/:pageId/:chunkId" element={<SeededLearning pageData={readSuccess} />} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    );

    await screen.findByText(prepareSuccess.initial_question.text);
    fireEvent.change(screen.getByLabelText(/your explanation/i), {
      target: { value: 'Plants get their food directly from sunlight.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check understanding/i }));

    fireEvent.click(await screen.findByRole('button', { name: /try follow-up question/i }));
    await screen.findByText(checkMisconception.attempt.feedback.follow_up_question.text);

    // Open hint -> marks assistance sticky
    fireEvent.click(screen.getByRole('button', { name: /show hint/i }));
    expect(screen.getByText(/In-app help opened during this retry:/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/your explanation/i), {
      target: { value: 'Sunlight supplies energy.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit retry answer/i }));

    expect(await screen.findByText(/Completed with in-app conceptual help/i)).toBeInTheDocument();
    expect(screen.getByText(/Not retested by the retry question/i)).toBeInTheDocument();
  });
});
