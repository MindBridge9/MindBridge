import { StageSurface } from '../components/motion/MotionSystem';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Dialog, LoadingStatus, Notice, SourceQuote } from '../components/common';
import { UnderstandingForm } from '../components/understanding/UnderstandingForm';
import { FeedbackView } from '../components/understanding/FeedbackView';
import { RetryView } from '../components/understanding/RetryView';
import { LearningResults } from '../components/understanding/LearningResults';
import { ReadingSettingsDialog } from '../components/settings/ReadingSettingsDialog';
import { MissingPage } from './MissingPage';
import { usePage } from '../context/PageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useApi } from '../context/ApiContext';
import { useLearningSession } from '../hooks/useLearningSession';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { describeAvailabilityReason } from '../config/features';

const LEARNING_STAGES = [
  { key: 'explain', label: '1. Explain' },
  { key: 'repair', label: '2. Repair' },
  { key: 'retry', label: '3. Retry' },
  { key: 'results', label: '4. Compare' },
];

function resolveStageKey(stage) {
  if (stage === 'feedback') return 'repair';
  if (stage === 'retrying' || stage === 'submitting_retry') return 'retry';
  if (stage === 'results') return 'results';
  return 'explain';
}

export function LearningPage({ onSaveSession = null }) {
  const { pageId, chunkId } = useParams();
  const navigate = useNavigate();
  const { page, sourceOrigin, learningSession, setLearningSession } = usePage();
  const { preferences, storageWarning, updatePreferences, resetPreferences } = usePreferences();
  const { getFeatureState, healthStatus, refreshHealth } = useApi();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [saveLocally, setSaveLocally] = useState(Boolean(learningSession));

  const selectedChunk = useMemo(
    () => page?.chunks?.find((c) => c.id === chunkId) || null,
    [page, chunkId]
  );

  const isValidTarget = Boolean(
    page &&
      page.id === pageId &&
      selectedChunk &&
      selectedChunk.quality === 'clear' &&
      selectedChunk.kind === 'paragraph'
  );

  const learningAvailability = getFeatureState('learning', {
    page,
    requireClearSource: true,
  });

  const handleSessionChange = useCallback(
    (snapshot) => {
      setLearningSession(snapshot);
      if (saveLocally && onSaveSession) {
        onSaveSession(snapshot);
      }
    },
    [setLearningSession, saveLocally, onSaveSession]
  );

  const sessionCtrl = useLearningSession({
    page: isValidTarget ? page : null,
    chunkId: isValidTarget ? chunkId : null,
    restoredSession: learningSession,
    onSessionChange: handleSessionChange,
  });

  const speech = useSpeechQueue({
    sentences: [],
    voiceUri: preferences.voice_uri,
    rate: preferences.speech_rate,
  });

  const { state, prepare } = sessionCtrl;

  useEffect(() => {
    if (
      isValidTarget &&
      sourceOrigin !== 'sample' &&
      learningAvailability.available &&
      state.stage === 'preparing' &&
      !state.plan
    ) {
      prepare();
    }
  }, [
    isValidTarget,
    sourceOrigin,
    learningAvailability.available,
    state.stage,
    state.plan,
    prepare,
  ]);



  if (!isValidTarget) {
    return (
      <MissingPage
        title="Learning section unavailable"
        description="This textbook section could not be found in your active session or has uncertain extracted text. Open or scan a textbook page to choose a clear paragraph."
      />
    );
  }

  const returnToReader = () => {
    sessionCtrl.requestHelp('source');
    speech.stop();
    navigate(`/read/${page.id}`);
  };

  const handleOpenSourceReview = () => {
    sessionCtrl.requestHelp('source');
    setSourceModalOpen(true);
  };

  const latestAttempt = state.attempts[state.attempts.length - 1] || null;
  const sourceChunks = [selectedChunk];
  const activeStageKey = resolveStageKey(state.stage);


  return (
    <AppShell
      readingTheme={preferences.theme}
      onOpenSettings={() => setSettingsOpen(true)}
      extraNav={
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={returnToReader}>
          Back to reader
        </Button>
      }
    >
      <StageSurface stage={activeStageKey} data-learning-stage={activeStageKey} className="mb-shell-container mb-learning-container py-6 sm:py-8 flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] sm:text-[32px] font-extrabold tracking-[-0.02em] m-0">
              Check your understanding
            </h1>
            <p className="mb-theme-muted text-[15px] m-0">
              {page.title} · Section {page.chunks.filter(c => c.kind !== 'heading').findIndex(c => c.id === selectedChunk.id) + 1}
              {state.plan?.target_concept ? ` · ${state.plan.target_concept}` : ''}
            </p>
          </div>

          <ol
            aria-label="Learning stages"
            className="mb-learning-stages"
          >
            {LEARNING_STAGES.map((item, index) => {
              const isCurrent = item.key === activeStageKey;
              return (
                <li
                  key={item.key}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`rounded-[6px] border px-2.5 py-2 text-center font-semibold ${
                    isCurrent
                      ? 'bg-[var(--mb-action)] text-white border-[var(--mb-action)]'
                      : 'mb-theme-chip border-[var(--mb-border-subtle)]'
                  }`}
                >
                  <span className="mb-stage-number" aria-hidden="true">{index + 1}</span><span>{item.label.slice(3)}</span>
                </li>
              );
            })}
          </ol>

          {onSaveSession && sourceOrigin !== 'sample' ? (
            <label className="inline-flex items-center gap-2.5 text-[13px] cursor-pointer self-start min-h-[36px]">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[var(--mb-action)]"
                checked={saveLocally}
                onChange={(event) => {
                  const next = event.target.checked;
                  setSaveLocally(next);
                  if (next && state.plan) {
                    onSaveSession({
                      id: state.sessionId,
                      page_id: page.id,
                      chunk_id: chunkId,
                      plan: state.plan,
                      attempts: state.attempts,
                      retry_result: state.latestRetryResult,
                      draft: state.draft,
                    });
                  }
                }}
              />
              <span>Save learning progress on this device (optional)</span>
            </label>
          ) : null}
        </header>

        {sourceOrigin === 'sample' || !learningAvailability.available ? (
          <Notice
            tone="warning"
            title="Comprehension practice is currently unavailable"
            actions={
              <Button variant="primary" size="sm" onClick={returnToReader}>
                Return to reader
              </Button>
            }
          >
            <Button variant="secondary" size="sm" loading={healthStatus === 'pending'} onClick={refreshHealth}>Recheck connection</Button>
            <p className="m-0">
              {sourceOrigin === 'sample'
                ? 'Comprehension evaluation requires a live scanned textbook page.'
                : describeAvailabilityReason(
                    learningAvailability.reason,
                    'Comprehension practice'
                  )}
            </p>
          </Notice>
        ) : null}

        {sessionCtrl.atAttemptCap ? (
          <Notice
            tone="warning"
            title="Maximum session attempts reached (20)"
            actions={
              <>
                {state.latestRetryResult ? (
                  <Button variant="primary" size="sm" onClick={sessionCtrl.viewResults}>
                    View comparison
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={sessionCtrl.resetSession}>
                  Start new session
                </Button>
              </>
            }
          >
            <p className="m-0">
              You have reached the 20-submission limit for this learning session. Review your
              results or start a fresh session.
            </p>
          </Notice>
        ) : null}

        {(learningAvailability.available || state.plan) && sourceOrigin !== 'sample' ? (
          <>
            {state.stage === 'preparing' ? (
              <LoadingStatus
                message="Preparing a source-grounded question…"
                detail="Finding a clear concept in your selected passage."
                onCancel={sessionCtrl.cancelPrepare}
                cancelLabel="Cancel waiting"
              />
            ) : null}

            {state.stage === 'prep_error' ? (
              <Notice
                tone="error"
                title="Could not prepare a question for this paragraph"
                actions={
                  <>
                    <Button variant="primary" size="sm" icon={RefreshCw} onClick={prepare}>
                      Try again
                    </Button>
                    <Button variant="secondary" size="sm" onClick={returnToReader}>
                      Choose another paragraph
                    </Button>
                  </>
                }
              >
                <p className="m-0">
                  {state.error?.message ||
                    'This passage may not contain enough clear concepts for a question.'}
                </p>
              </Notice>
            ) : null}

            {(state.stage === 'answering' || state.stage === 'submitting') &&
            state.plan?.initial_question ? (
              <div className="flex flex-col gap-5">
                <details className="mb-reading-paper p-4" onToggle={(event) => { if (event.currentTarget.open) sessionCtrl.requestHelp('source'); }}>
                  <summary className="text-[14px] font-semibold cursor-pointer inline-flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[var(--mb-accent)]" aria-hidden="true" />
                    <span>Show selected textbook passage</span>
                  </summary>
                  <div className="mt-3">
                    <SourceQuote chunkId={selectedChunk.id} quote={selectedChunk.text} />
                  </div>
                </details>

                <UnderstandingForm
                  question={state.plan.initial_question}
                  draft={state.draft}
                  canSubmit={learningAvailability.available}
                  pending={state.stage === 'submitting'}
                  error={state.error}
                  validationError={state.validationError}
                  canPronounce={speech.status !== 'unsupported'}
                  onPronounceQuestion={speech.pronounce}
                  onDraftChange={sessionCtrl.setDraft}
                  onSubmit={() => learningAvailability.available && sessionCtrl.submitAnswer()}
                  onCancelSubmit={sessionCtrl.cancelSubmit}
                />
              </div>
            ) : null}

            {state.stage === 'feedback' && latestAttempt && state.plan?.objective ? (
              <FeedbackView
                attempt={latestAttempt}
                objective={state.plan.objective}
                isRetryStage={Boolean(
                  state.evaluatedInitialBaseline &&
                    latestAttempt !== state.evaluatedInitialBaseline
                )}
                atAttemptCap={sessionCtrl.atAttemptCap}
                onRetry={sessionCtrl.startRetry}
                onClarify={sessionCtrl.clarifyUncertain}
                onReviewSource={handleOpenSourceReview}
                onViewResults={state.latestRetryResult ? sessionCtrl.viewResults : null}
                onExit={returnToReader}
              />
            ) : null}

            {(state.stage === 'retrying' || state.stage === 'submitting_retry') &&
            sessionCtrl.currentQuestion ? (
              <RetryView
                question={sessionCtrl.currentQuestion}
                draft={state.draft}
                assistance={state.assistance}
                previousAttempt={state.evaluatedInitialBaseline}
                sourceChunks={sourceChunks}
                canSubmit={learningAvailability.available}
                pending={state.stage === 'submitting_retry'}
                error={state.error}
                validationError={state.validationError}
                canPronounce={speech.status !== 'unsupported'}
                onPronounceQuestion={speech.pronounce}
                onDraftChange={sessionCtrl.setDraft}
                onRequestHelp={sessionCtrl.requestHelp}
                onSubmit={() => learningAvailability.available && sessionCtrl.submitAnswer()}
                onCancelSubmit={sessionCtrl.cancelSubmit}
                onExit={returnToReader}
              />
            ) : null}

            {state.stage === 'results' && state.latestRetryResult && state.plan ? (
              <LearningResults
                session={{
                  id: state.sessionId,
                  page_id: page.id,
                  chunk_id: chunkId,
                  plan: state.plan,
                  attempts: state.attempts,
                  retry_result: state.latestRetryResult,
                }}
                onReturnToOriginal={returnToReader}
                onStartNewSession={() => {
                  sessionCtrl.resetSession();
                }}
              />
            ) : null}
          </>
        ) : null}
      </StageSurface>

      <Dialog
        open={sourceModalOpen}
        title="Original textbook passage"
        description={`Selected passage from ${page.title}`}
        onClose={() => {
          sessionCtrl.closeSourceReview();
          setSourceModalOpen(false);
        }}
        footer={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              sessionCtrl.closeSourceReview();
              setSourceModalOpen(false);
            }}
          >
            Done reviewing
          </Button>
        }
      >
        <SourceQuote chunkId={selectedChunk.id} quote={selectedChunk.text} />
      </Dialog>

      <ReadingSettingsDialog
        open={settingsOpen}
        preferences={preferences}
        voices={speech.voices}
        storageWarning={storageWarning}
        onChange={updatePreferences}
        onReset={resetPreferences}
        onClose={() => setSettingsOpen(false)}
      />
    </AppShell>
  );
}
