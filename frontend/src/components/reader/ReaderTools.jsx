import { useState } from 'react';
import { BookMarked, Eye, GraduationCap, Lightbulb } from 'lucide-react';
import { Button, Field, Notice } from '../common';
import { ReadingModeControl } from './ReadingModeControl';
import { describeAvailabilityReason } from '../../config/features';

export function ReaderTools({
  page,
  group = 'all',
  selectedChunkId = null,
  mode = 'original',
  availableLevels = ['original'],
  simplifyPending = false,
  simplifyError = null,
  simplifiedItem = null,
  sourceOrigin = 'live',
  cachedDefinitions = [],
  cachedExplanations = [],
  capabilities = {},
  onModeChange,
  onCancelSimplify,
  onSimplifySelected,
  onOpenSource,
  onLookupTerm,
  onRequestExplain,
  onStartLearning,
}) {
  const [conceptDraft, setConceptDraft] = useState('');
  const [phraseDraft, setPhraseDraft] = useState('');

  if (!page) return null;

  const selectedChunk = page.chunks.find((c) => c.id === selectedChunkId) || null;
  const isClearSelectable = Boolean(
    selectedChunk && selectedChunk.quality === 'clear' && selectedChunk.kind !== 'heading'
  );
  const isClearParagraph = Boolean(
    selectedChunk && selectedChunk.quality === 'clear' && selectedChunk.kind === 'paragraph'
  );
  const isSample = sourceOrigin === 'sample';

  const canSimplify = !isSample && Boolean(capabilities.simplify?.available) && isClearSelectable;
  const canDefine = !isSample && Boolean(capabilities.define?.available) && isClearSelectable;
  const canExplain = !isSample && Boolean(capabilities.explain?.available) && isClearSelectable;
  const canLearn = !isSample && Boolean(capabilities.learning?.available) && isClearParagraph;

  const handleExplainSubmit = (event) => {
    event.preventDefault();
    if (!conceptDraft.trim() || !canExplain) return;
    onRequestExplain?.({ chunkId: selectedChunk.id, concept: conceptDraft.trim() });
  };

  const handleDefineSubmit = (event) => {
    event.preventDefault();
    if (!phraseDraft.trim() || !selectedChunk) return;
    onLookupTerm?.({
      chunkId: selectedChunk.id,
      phrase: phraseDraft.trim(),
      sentence: selectedChunk.text,
    });
  };

  return (
    <aside aria-label={group === 'primary' ? 'Reading actions' : 'Reading and learning tools'} className={`mb-reader-tools mb-reader-tools-${group}`}>
      {group !== 'secondary' ? <>
      {/* Section selection & mode panel */}
      <section className="mb-theme-control-panel rounded-[12px] border border-[var(--mb-border)] bg-[var(--mb-surface)] p-4 flex flex-col gap-3 text-[var(--mb-text)]">
        <h2 className="text-[16px] font-bold m-0">Read this section</h2>

        <ReadingModeControl
          value={mode}
          availableLevels={simplifiedItem || canSimplify ? ['original', 'easy'] : availableLevels}
          pending={simplifyPending}
          onChange={onModeChange}
        />

        {!selectedChunk ? (
          <p className="mb-theme-muted text-[13px] text-[var(--mb-text-muted)] m-0">
            Select a clear paragraph from the passage to simplify it, ask for an explanation, or
            check your understanding.
          </p>
        ) : !isClearSelectable ? (
          <Notice tone="warning">
            <p className="m-0">
              {selectedChunk.quality === 'uncertain'
                ? 'This section was flagged as uncertain extracted text. Verify it with your photo or choose a clear section for AI tools.'
                : 'Select a clear paragraph or list item (not a heading) for AI tools.'}
            </p>
          </Notice>
        ) : simplifiedItem ? (
          <div className="flex flex-wrap gap-2">
            {simplifiedItem ? (
              <Button
                variant="primary"
                size="sm"
                icon={Eye}
                onClick={() => onOpenSource?.(selectedChunk.id)}
              >
                Open SourceLens
              </Button>
            ) : null}
          </div>
        ) : null}

        {simplifyPending ? <Button variant="quiet" onClick={onCancelSimplify}>Cancel waiting</Button> : null}
        {simplifyError ? (
          <Notice
            tone="error"
            title="Could not simplify section"
            actions={
              simplifyError.retryable && canSimplify ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSimplifySelected?.(selectedChunk.id)}
                >
                  Try again
                </Button>
              ) : null
            }
          >
            <p className="m-0">{simplifyError.message}</p>
            {simplifyError.retryAfterSeconds ? (
              <p className="m-0 mt-1 text-[13px] font-semibold">
                Wait {simplifyError.retryAfterSeconds} seconds before trying again.
              </p>
            ) : null}
          </Notice>
        ) : null}

        {!isSample && !capabilities.simplify?.available && !simplifiedItem ? (
          <p className="mb-theme-muted text-[12px] text-[var(--mb-text-muted)] m-0">
            {describeAvailabilityReason(capabilities.simplify?.reason, 'Section simplification')}
          </p>
        ) : null}
      </section>

      {/* Check understanding entry point */}
      <section className="mb-theme-control-panel rounded-[12px] border border-[var(--mb-border)] bg-[var(--mb-surface)] p-4 flex flex-col gap-3 text-[var(--mb-text)]">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[var(--mb-accent)]" aria-hidden="true" />
          <h2 className="text-[16px] font-bold m-0">Check understanding</h2>
        </div>
        <p className="mb-practice-intro mb-theme-muted text-[13px] text-[var(--mb-text-muted)] m-0">
          Explain the selected paragraph in your own words, receive grounded repair feedback, and try
          a follow-up question.
        </p>
        <Button
          variant="primary"
          disabled={!canLearn}
          onClick={() => selectedChunk && onStartLearning?.(selectedChunk.id)}
        >
          Practice this section
        </Button>
        {isSample ? (
          <p className="mb-theme-muted text-[12px] text-[var(--mb-text-muted)] m-0">
            Practice requires a live scanned page and active backend learning capabilities.
          </p>
        ) : !capabilities.learning?.available ? (
          <p className="mb-theme-muted text-[12px] text-[var(--mb-text-muted)] m-0">
            {describeAvailabilityReason(capabilities.learning?.reason, 'Comprehension practice')}
          </p>
        ) : selectedChunk && !isClearParagraph ? (
          <p className="mb-theme-muted text-[12px] text-[var(--mb-text-muted)] m-0">
            Select a clear textbook paragraph (not a heading, list item, or caption) to start
            practice.
          </p>
        ) : null}
      </section>

      </> : null}
      {group !== 'primary' ? <>
      {/* Glossary (initial glossary + optional on-demand /define) */}
      <section className="mb-theme-control-panel rounded-[12px] border border-[var(--mb-border)] bg-[var(--mb-surface)] p-4 flex flex-col gap-3 text-[var(--mb-text)]">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-[var(--mb-accent)]" aria-hidden="true" />
          <h2 className="text-[16px] font-bold m-0">Glossary</h2>
        </div>

        {Array.isArray(page.glossary) && page.glossary.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {page.glossary.map((entry) => (
              <button
                key={entry.phrase}
                type="button"
                onClick={() =>
                  onLookupTerm?.({
                    chunkId: entry.source_refs?.[0]?.chunk_id || selectedChunk?.id,
                    phrase: entry.phrase,
                    sentence: entry.source_refs?.[0]?.quote || '',
                  })
                }
                className="mb-theme-chip min-h-[44px] px-3 py-1.5 rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-support)]/55 text-[var(--mb-text)] text-[13px] font-semibold hover:bg-[var(--mb-support)] cursor-pointer"
              >
                {entry.phrase}
              </button>
            ))}
          </div>
        ) : (
          <p className="mb-theme-muted text-[13px] text-[var(--mb-text-muted)] m-0">
            No initial glossary entries were extracted for this page.
          </p>
        )}

        {cachedDefinitions.length > 0 ? <div className="flex flex-wrap gap-2" aria-label="Previously generated definitions">{cachedDefinitions.map((lookup, index) => <Button key={index} variant="secondary" size="sm" onClick={() => onLookupTerm?.(lookup)}>Review {lookup.phrase} definition</Button>)}</div> : null}
        {isClearSelectable && !isSample ? (
          <form onSubmit={handleDefineSubmit} className="flex flex-col gap-2 pt-2 border-t border-[var(--mb-reading-border-subtle)]">
            <Field label="Look up a phrase from the selected section">
              {(fieldProps) => (
                <div className="flex gap-2">
                  <input
                    {...fieldProps}
                    type="text"
                    value={phraseDraft}
                    onChange={(e) => setPhraseDraft(e.target.value)}
                    placeholder="Exact word or phrase"
                    disabled={!canDefine}
                    className="mb-theme-input flex-1 min-w-0 min-h-[44px] rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-surface)] px-3 text-[14px] text-[var(--mb-text)]"
                  />
                  <Button type="submit" variant="secondary" size="sm" disabled={!canDefine || !phraseDraft.trim()}>
                    Define
                  </Button>
                </div>
              )}
            </Field>
            {!capabilities.define?.available ? (
              <p className="mb-theme-muted text-[12px] text-[var(--mb-text-muted)] m-0">
                {describeAvailabilityReason(capabilities.define?.reason, 'On-demand definitions')}
              </p>
            ) : null}
          </form>
        ) : null}
      </section>

      {/* Concept explanation (/explain) */}
      {!isSample ? (
        <section className="mb-theme-control-panel rounded-[12px] border border-[var(--mb-border)] bg-[var(--mb-surface)] p-4 flex flex-col gap-3 text-[var(--mb-text)]">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-[var(--mb-accent)]" aria-hidden="true" />
            <h2 className="text-[16px] font-bold m-0">Explain a concept</h2>
          </div>
          {cachedExplanations.length > 0 ? <div className="flex flex-wrap gap-2" aria-label="Previously generated explanations">{cachedExplanations.map((lookup, index) => <Button key={index} variant="secondary" size="sm" onClick={() => onRequestExplain?.(lookup)}>Review {lookup.concept}</Button>)}</div> : null}
          <form onSubmit={handleExplainSubmit} className="flex flex-col gap-2">
            <Field label="What would you like explained from this section?">
              {(fieldProps) => (
                <div className="flex gap-2">
                  <input
                    {...fieldProps}
                    type="text"
                    value={conceptDraft}
                    onChange={(e) => setConceptDraft(e.target.value)}
                    placeholder="e.g. Role of sunlight"
                    disabled={!canExplain}
                    className="mb-theme-input flex-1 min-w-0 min-h-[44px] rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-surface)] px-3 text-[14px] text-[var(--mb-text)]"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={!canExplain || !conceptDraft.trim()}
                  >
                    Explain
                  </Button>
                </div>
              )}
            </Field>
            {!capabilities.explain?.available ? (
              <p className="mb-theme-muted text-[12px] text-[var(--mb-text-muted)] m-0">
                {describeAvailabilityReason(capabilities.explain?.reason, 'Concept explanations')}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
      </> : null}
    </aside>
  );
}
