import { AlertTriangle, Check } from 'lucide-react';

function renderSentenceWithTerms(sentence, chunkId, chunkTerms, onTermSelect, isActive) {
  const text = sentence.text;
  if (!chunkTerms || chunkTerms.length === 0 || !onTermSelect) {
    return (
      <span
        data-sentence-id={sentence.id}
        className={isActive ? 'mb-sentence-active' : undefined}
      >
        {text}
      </span>
    );
  }

  const sorted = [...chunkTerms].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const nodes = [];
  let lastIndex = 0;
  let match;
  let partIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const matchedPhrase = match[0];
    nodes.push(
      <button
        key={`${sentence.id}-term-${partIdx++}`}
        type="button"
        className="mb-term-trigger"
        onClick={(event) => {
          event.stopPropagation();
          onTermSelect({
            chunkId,
            phrase: matchedPhrase,
            sentence: text.trim(),
          });
        }}
        aria-label={`Look up term: ${matchedPhrase}`}
      >
        {matchedPhrase}
      </button>
    );
    lastIndex = match.index + matchedPhrase.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return (
    <span
      data-sentence-id={sentence.id}
      className={isActive ? 'mb-sentence-active' : undefined}
    >
      {nodes.length > 0 ? nodes : text}
    </span>
  );
}

export function ReaderCanvas({
  chunks = [],
  displayByChunkId = {},
  selectedChunkId = null,
  activeSentenceId = null,
  keyTerms = [],
  mode = 'original',
  onSelectChunk = null,
  onTermSelect = null,
}) {
  if (!chunks || chunks.length === 0) {
    return null;
  }

  return (
    <article
      aria-label="Textbook reading passage"
      className="mb-reading-paper p-5 sm:p-8 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--mb-reading-border-subtle)]">
        <span className="mb-theme-muted text-[12px] font-semibold uppercase tracking-[0.04em]">
          {mode === 'easy'
            ? 'Simplified mode (only selected sections are simplified)'
            : 'Original extracted textbook text'}
        </span>
        <span className="mb-theme-muted text-[12px]">
          Tap underlined terms to define
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {chunks.map((chunk) => {
          const display = displayByChunkId?.[chunk.id];
          const level = display?.level || 'original';
          const sentences =
            display?.sentences && display.sentences.length > 0
              ? display.sentences
              : [{ id: `${chunk.id}:0`, chunkId: chunk.id, level, text: chunk.text }];
          const isSelected = chunk.id === selectedChunkId;
          const isUncertain = chunk.quality === 'uncertain';
          const isSimplified = level === 'easy';
          const showProvenanceTag = mode === 'easy' || isSimplified || isUncertain;

          const chunkTerms =
            !isUncertain && level === 'original'
              ? keyTerms
                  .filter((t) => Array.isArray(t.chunk_ids) && t.chunk_ids.includes(chunk.id))
                  .map((t) => t.term)
              : [];

          const content = sentences.map((sentence) => (
            <span key={sentence.id}>
              {renderSentenceWithTerms(
                sentence,
                chunk.id,
                chunkTerms,
                onTermSelect,
                activeSentenceId === sentence.id
              )}
            </span>
          ));

          let semanticBody;
          if (chunk.kind === 'heading') {
            semanticBody = (
              <h2 className="mb-reading-prose font-bold text-[1.35em] m-0">{content}</h2>
            );
          } else if (chunk.kind === 'list_item') {
            semanticBody = (
              <ul className="mb-reading-prose list-disc pl-6 m-0">
                <li>{content}</li>
              </ul>
            );
          } else if (chunk.kind === 'caption') {
            semanticBody = (
              <figure className="m-0">
                <figcaption className="mb-reading-prose italic opacity-90">{content}</figcaption>
              </figure>
            );
          } else {
            semanticBody = <p className="mb-reading-prose m-0">{content}</p>;
          }

          const selectable = chunk.kind !== 'heading';

          return (
            <div
              key={chunk.id}
              className={`rounded-[8px] border px-3.5 py-3 transition-colors duration-150 ${
                isSelected
                  ? 'mb-theme-selected-row border-[#204C43] bg-[#DCE9DF]/30'
                  : isUncertain
                    ? 'border-[#9A601C] bg-[#FDF3E1]/40'
                    : 'border-transparent'
              }`}
            >
              {(showProvenanceTag || (selectable && onSelectChunk)) ? (
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {isSimplified ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] bg-[#204C43] text-white text-[12px] font-semibold">
                        Simplified (Easy)
                      </span>
                    ) : mode === 'easy' ? (
                      <span className="mb-theme-chip inline-flex items-center px-2 py-0.5 rounded-[4px] border text-[12px] font-semibold">
                        Original
                      </span>
                    ) : null}

                    {isUncertain ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#FDF3E1] border border-[#9A601C] text-[#9A601C] text-[12px] font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        Uncertain text — verify photo
                      </span>
                    ) : null}
                  </div>

                  {selectable && onSelectChunk ? (
                    <button
                      type="button"
                      onClick={() => onSelectChunk(chunk.id)}
                      aria-pressed={isSelected}
                      className={`min-h-[36px] px-2.5 py-1 rounded-[6px] text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer border transition-colors duration-150 ${
                        isSelected
                          ? 'bg-[#204C43] text-white border-[#204C43]'
                          : 'mb-theme-btn-secondary bg-white text-[#20372D] border-[#8B9B91] hover:bg-[#DCE9DF]/50'
                      }`}
                    >
                      {isSelected ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : null}
                      <span>{isSelected ? 'Selected' : 'Select'}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              {semanticBody}
            </div>
          );
        })}
      </div>
    </article>
  );
}
