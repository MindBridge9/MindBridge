import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookmarkCheck, BookmarkPlus, Image as ImageIcon } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Notice, SourceQuote } from '../components/common';
import { ReaderCanvas } from '../components/reader/ReaderCanvas';
import { PhotoDialog } from '../components/reader/PhotoDialog';
import { ReaderTools } from '../components/reader/ReaderTools';
import { ExplanationPanel } from '../components/reader/ExplanationPanel';
import { GlossaryPanel } from '../components/glossary/GlossaryPanel';
import { SourceLensDialog } from '../components/source-lens/SourceLensDialog';
import { SpeechControls } from '../components/speech/SpeechControls';
import { segmentDisplayedChunks } from '../components/speech/segmentDisplayedChunks';
import { ReadingSettingsDialog } from '../components/settings/ReadingSettingsDialog';
import { MissingPage } from './MissingPage';
import { usePage } from '../context/PageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useApi } from '../context/ApiContext';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { useReadingTools } from '../hooks/useReadingTools';

export function ReaderPage({ onSaveCurrentPage = null, isSavedPage = false }) {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const { page, readability, retakeReasons, imageUrl, sourceOrigin } = usePage();
  const { preferences, storageWarning, updatePreferences, resetPreferences } = usePreferences();
  const { getFeatureState } = useApi();

  const [selectedChunkId, setSelectedChunkId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sourceLensChunkId, setSourceLensChunkId] = useState(null);

  const tools = useReadingTools(page);

  useEffect(() => {
    if (!page) return;
    const firstClear = page.chunks.find((c) => c.quality === 'clear' && c.kind !== 'heading');
    setSelectedChunkId(firstClear?.id || page.chunks[0]?.id || null);
  }, [page]);

  const capabilities = useMemo(
    () => ({
      simplify: getFeatureState('simplify', { page, requireClearSource: true }),
      define: getFeatureState('define', { page, requireClearSource: true }),
      explain: getFeatureState('explain', { page, requireClearSource: true }),
      learning: getFeatureState('learning', { page, requireClearSource: true }),
    }),
    [getFeatureState, page]
  );

  // Build displayByChunkId without mutating original PageDoc chunks
  const displayByChunkId = useMemo(() => {
    if (!page) return {};
    const map = {};
    for (const chunk of page.chunks) {
      if (tools.mode === 'easy') {
        const cached = tools.simplificationCache[`${page.id}:${chunk.id}:easy`];
        if (cached) {
          map[chunk.id] = { level: 'easy', text: cached.text };
          continue;
        }
      }
      map[chunk.id] = { level: 'original', text: chunk.text };
    }
    return map;
  }, [page, tools.mode, tools.simplificationCache]);

  const segmented = useMemo(() => {
    if (!page) return { sentences: [], byChunkId: {} };
    return segmentDisplayedChunks({
      pageId: page.id,
      chunks: page.chunks,
      displayByChunkId,
    });
  }, [page, displayByChunkId]);

  const speech = useSpeechQueue({
    sentences: segmented.sentences,
    voiceUri: preferences.voice_uri,
    rate: preferences.speech_rate,
    highlightSentence: preferences.highlight_sentence,
    autoScroll: preferences.auto_scroll,
  });

  if (!page || page.id !== pageId) {
    return <MissingPage />;
  }

  const activeSimplifiedItem = selectedChunkId
    ? tools.simplificationCache[`${page.id}:${selectedChunkId}:easy`] || null
    : null;

  const sourceLensOriginal = sourceLensChunkId
    ? page.chunks.find((c) => c.id === sourceLensChunkId) || null
    : null;
  const sourceLensGenerated = sourceLensChunkId
    ? tools.simplificationCache[`${page.id}:${sourceLensChunkId}:easy`] || null
    : null;

  const handleModeChange = async (nextLevel) => {
    speech.stop();
    if (nextLevel === 'original') {
      tools.setMode('original');
      return;
    }
    if (nextLevel === 'easy') {
      if (selectedChunkId && tools.simplificationCache[`${page.id}:${selectedChunkId}:easy`]) {
        tools.setMode('easy');
        return;
      }
      if (selectedChunkId && capabilities.simplify?.available && sourceOrigin !== 'sample') {
        await tools.simplifyChunk(selectedChunkId, 'easy');
      } else {
        tools.setMode('easy');
      }
    }
  };

  const handleSimplifySelected = async (chunkId) => {
    speech.stop();
    await tools.simplifyChunk(chunkId, 'easy');
  };

  return (
    <AppShell
      readingTheme={preferences.theme}
      onOpenSettings={() => setSettingsOpen(true)}
      extraNav={
        onSaveCurrentPage && sourceOrigin !== 'sample' ? (
          <Button
            variant="secondary"
            size="sm"
            icon={isSavedPage ? BookmarkCheck : BookmarkPlus}
            onClick={() => onSaveCurrentPage(page)}
          >
            {isSavedPage ? 'Saved on device' : 'Save page'}
          </Button>
        ) : null
      }
      stickyBottom={
        <SpeechControls
          status={speech.status}
          canPrevious={speech.canPrevious}
          canNext={speech.canNext}
          activeIndex={speech.activeIndex}
          totalSentences={segmented.sentences.length}
          errorMessage={speech.errorMessage}
          onPlay={speech.play}
          onPause={speech.pause}
          onResume={speech.resume}
          onStop={speech.stop}
          onPrevious={speech.previous}
          onNext={speech.next}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      }
    >
      <div className="mb-shell-container py-6 sm:py-8 flex flex-col gap-6">
        {/* Page title & provenance header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mb-theme-chip px-2.5 py-0.5 rounded-[4px] border text-[12px] font-semibold">
                {page.title_origin === 'source' ? 'Textbook heading' : 'Generated title'}
              </span>
              {sourceOrigin === 'sample' ? (
                <span className="px-2.5 py-0.5 rounded-[4px] bg-[#F6E7A5] text-[#20372D] text-[12px] font-semibold">
                  Preprocessed sample
                </span>
              ) : null}
            </div>
            <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-[-0.02em] m-0">
              {page.title}
            </h1>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={ImageIcon}
            onClick={() => setPhotoOpen(true)}
          >
            View original photo
          </Button>
        </header>

        {sourceOrigin === 'sample' ? (
          <Notice tone="info" title="Preprocessed sample page">
            <p className="m-0">
              You are exploring a labelled sample passage. Reading settings, sentence speech, and
              the sample glossary work locally; live AI simplification and comprehension checks are
              disabled on this sample.
            </p>
          </Notice>
        ) : null}

        {(readability === 'partial' || (page.extraction_warnings && page.extraction_warnings.length > 0)) && (
          <Notice
            tone="warning"
            title="Partial extraction — some parts need review"
            actions={
              <Button variant="secondary" size="sm" onClick={() => setPhotoOpen(true)}>
                Inspect original photo
              </Button>
            }
          >
            <ul className="m-0 pl-5 space-y-1">
              {page.extraction_warnings.map((w, idx) => (
                <li key={`${w.code}-${idx}`}>{w.message}</li>
              ))}
              {retakeReasons.length > 0 && page.extraction_warnings.length === 0 ? (
                <li>Retake note: {retakeReasons.join(', ')}.</li>
              ) : null}
            </ul>
          </Notice>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Primary Reading Surface */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {/* Separate AI Summary Panel */}
            <section
              aria-label="Page summary"
              className="mb-reading-paper p-4 sm:p-5 flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold m-0">Page summary (AI-generated)</h2>
                <span className="mb-theme-muted text-[12px]">Separate from original text</span>
              </div>
              {page.summary ? (
                <>
                  <p className="mb-reading-prose m-0">{page.summary.text}</p>
                  {page.summary.source_refs?.length > 0 ? (
                    <details className="mt-1">
                      <summary className="text-[13px] font-semibold cursor-pointer">
                        View summary source quote
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        {page.summary.source_refs.map((ref, idx) => (
                          <SourceQuote
                            key={`${ref.chunk_id}-${idx}`}
                            chunkId={ref.chunk_id}
                            quote={ref.quote}
                          />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="mb-theme-muted text-[14px] m-0">
                  Summary unavailable for this page. Original extracted text remains complete below.
                </p>
              )}
            </section>

            <ReaderCanvas
              chunks={page.chunks}
              displayByChunkId={segmented.byChunkId}
              selectedChunkId={selectedChunkId}
              activeSentenceId={speech.activeSentenceId}
              keyTerms={page.key_terms}
              mode={tools.mode}
              onSelectChunk={setSelectedChunkId}
              onTermSelect={({ chunkId, phrase, sentence }) =>
                tools.lookupTerm({
                  chunkId,
                  phrase,
                  sentence,
                  allowRemote: sourceOrigin !== 'sample' && capabilities.define?.available,
                })
              }
            />
          </div>

          {/* Contextual Tools Column */}
          <div className="lg:col-span-4">
            <ReaderTools
              page={page}
              selectedChunkId={selectedChunkId}
              mode={tools.mode}
              availableLevels={activeSimplifiedItem ? ['original', 'easy'] : ['original']}
              simplifyPending={tools.simplifyStatus === 'pending'}
              simplifyError={tools.simplifyError}
              simplifiedItem={activeSimplifiedItem}
              sourceOrigin={sourceOrigin}
              capabilities={capabilities}
              onModeChange={handleModeChange}
              onSimplifySelected={handleSimplifySelected}
              onOpenSource={(chunkId) => setSourceLensChunkId(chunkId)}
              onLookupTerm={({ chunkId, phrase, sentence }) =>
                tools.lookupTerm({
                  chunkId,
                  phrase,
                  sentence,
                  allowRemote: sourceOrigin !== 'sample' && capabilities.define?.available,
                })
              }
              onRequestExplain={({ chunkId, concept }) =>
                tools.requestExplanation({
                  chunkId,
                  concept,
                  allowRemote: sourceOrigin !== 'sample' && capabilities.explain?.available,
                })
              }
              onStartLearning={(chunkId) => {
                speech.stop();
                navigate(`/learn/${page.id}/${chunkId}`);
              }}
            />
          </div>
        </div>
      </div>

      <ReadingSettingsDialog
        open={settingsOpen}
        preferences={preferences}
        voices={speech.voices}
        storageWarning={storageWarning}
        onChange={updatePreferences}
        onReset={resetPreferences}
        onClose={() => setSettingsOpen(false)}
      />

      <PhotoDialog open={photoOpen} imageUrl={imageUrl} onClose={() => setPhotoOpen(false)} />

      <GlossaryPanel
        open={tools.glossaryState.open}
        entry={tools.glossaryState.entry}
        phrase={tools.glossaryState.phrase}
        status={tools.glossaryState.status}
        error={tools.glossaryState.error}
        canPronounce={speech.status !== 'unsupported'}
        onPronounce={speech.pronounce}
        onRetry={() =>
          tools.lookupTerm({
            chunkId: tools.glossaryState.chunkId,
            phrase: tools.glossaryState.phrase,
            sentence: tools.glossaryState.sentence,
            allowRemote: sourceOrigin !== 'sample' && capabilities.define?.available,
          })
        }
        onClose={tools.closeGlossary}
      />

      <ExplanationPanel
        open={tools.explanationState.open}
        explanation={tools.explanationState.explanation}
        concept={tools.explanationState.concept}
        status={tools.explanationState.status}
        error={tools.explanationState.error}
        onRetry={() =>
          tools.requestExplanation({
            chunkId: tools.explanationState.chunkId,
            concept: tools.explanationState.concept,
            allowRemote: sourceOrigin !== 'sample' && capabilities.explain?.available,
          })
        }
        onClose={tools.closeExplanation}
      />

      <SourceLensDialog
        open={Boolean(sourceLensChunkId)}
        originalChunk={sourceLensOriginal}
        generatedItem={sourceLensGenerated}
        keyTermsStatus={page.key_terms_status}
        onOpenImage={() => {
          setSourceLensChunkId(null);
          setPhotoOpen(true);
        }}
        onClose={() => setSourceLensChunkId(null)}
      />
    </AppShell>
  );
}
