import { SourceQuote } from '../common';

export function SourceEvidence({ refs = [], label = 'Textbook evidence' }) {
  if (!Array.isArray(refs) || refs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {refs.map((ref, idx) => (
        <SourceQuote
          key={`${ref.chunk_id}-${idx}`}
          chunkId={ref.chunk_id}
          quote={ref.quote}
          label={label}
        />
      ))}
    </div>
  );
}
