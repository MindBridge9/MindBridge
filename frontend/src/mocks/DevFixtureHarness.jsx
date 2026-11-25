import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Notice } from '../components/common';
import { SourceLensDialog } from '../components/source-lens/SourceLensDialog';
import { FeedbackView } from '../components/understanding/FeedbackView';
import { RetryView } from '../components/understanding/RetryView';
import { LearningResults } from '../components/understanding/LearningResults';

import readSuccess from '../../../docs/fixtures/read.success.json';
import simplifyOmission from '../../../docs/fixtures/simplify.omission.json';
import prepareSuccess from '../../../docs/fixtures/prepare.success.json';
import checkMisconception from '../../../docs/fixtures/check.misconception.json';
import retrySuccess from '../../../docs/fixtures/retry.independent-success.json';

// Development-only isolated fixture harness for visual inspection of gated screens.
// Excluded from production builds via import.meta.env.DEV guard in App.jsx.
export default function DevFixtureHarness() {
  const [view, setView] = useState('sourcelens');

  const omissionOriginalChunk = {
    id: 'c0002',
    kind: 'paragraph',
    text: 'The sample contains 20 mL of water.',
    quality: 'clear',
  };

  return (
    <AppShell>
      <div className="mb-shell-container py-6 flex flex-col gap-6">
        <Notice tone="info" title="Isolated Development Fixture Harness">
          <p className="m-0">
            This dev-only route renders approved synthetic fixtures from{' '}
            <code>docs/fixtures/</code> to inspect SourceLens, Misconception Repair, Independent
            Retry, and Learning Results when backend AI capabilities are off.
          </p>
        </Notice>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === 'sourcelens' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('sourcelens')}
          >
            SourceLens
          </Button>
          <Button
            variant={view === 'repair' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('repair')}
          >
            Misconception Repair
          </Button>
          <Button
            variant={view === 'retry' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('retry')}
          >
            Independent Retry
          </Button>
          <Button
            variant={view === 'results' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('results')}
          >
            Learning Results
          </Button>
        </div>

        <SourceLensDialog
          open={view === 'sourcelens'}
          originalChunk={omissionOriginalChunk}
          generatedItem={simplifyOmission.items[0]}
          keyTermsStatus="available"
          onOpenImage={() => {}}
          onClose={() => setView('repair')}
        />

        {view === 'repair' ? (
          <div className="max-w-[820px]">
            <FeedbackView
              attempt={checkMisconception.attempt}
              objective={prepareSuccess.objective}
              isRetryStage={false}
              atAttemptCap={false}
              onRetry={() => setView('retry')}
              onClarify={() => {}}
              onReviewSource={() => {}}
              onExit={() => {}}
            />
          </div>
        ) : null}

        {view === 'retry' ? (
          <div className="max-w-[820px]">
            <RetryView
              question={checkMisconception.attempt.feedback.follow_up_question}
              draft=""
              assistance={{ used: false, kinds: [] }}
              previousAttempt={checkMisconception.attempt}
              sourceChunks={[readSuccess.page.chunks[1]]}
              onDraftChange={() => {}}
              onRequestHelp={() => {}}
              onSubmit={() => setView('results')}
              onExit={() => {}}
            />
          </div>
        ) : null}

        {view === 'results' ? (
          <div className="max-w-[820px]">
            <LearningResults
              session={{
                id: 'dev-session-1',
                page_id: readSuccess.page.id,
                chunk_id: 'c0002',
                plan: prepareSuccess,
                attempts: [checkMisconception.attempt, retrySuccess.attempt],
                retry_result: retrySuccess.retry_result,
              }}
              onReturnToOriginal={() => {}}
              onStartNewSession={() => {}}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
