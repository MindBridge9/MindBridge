export function SourceQuote({ quote, chunkId = null, label = 'From textbook', className = '' }) {
  return (
    <figure
      className={`mb-source-quote mb-theme-surface rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-bg)] p-3.5 m-0 ${className}`}
    >
      <figcaption className="mb-theme-muted flex items-center justify-between gap-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-text-muted)] mb-1.5">
        <span>{label}</span>
        {chunkId ? <details className="mb-source-reference"><summary>Reference</summary><span className="mb-tabular font-mono">{chunkId}</span></details> : null}
      </figcaption>
      <blockquote className="mb-reading-prose-inline m-0 ">
        “{quote}”
      </blockquote>
    </figure>
  );
}
