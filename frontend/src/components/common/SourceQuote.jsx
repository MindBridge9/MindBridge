export function SourceQuote({ quote, chunkId = null, label = 'From textbook', className = '' }) {
  return (
    <figure
      className={`mb-theme-surface rounded-[6px] border border-[#8B9B91] bg-[#F7F5ED] p-3.5 m-0 ${className}`}
    >
      <figcaption className="mb-theme-muted flex items-center justify-between gap-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#3F584D] mb-1.5">
        <span>{label}</span>
        {chunkId ? <span className="mb-tabular font-mono">{chunkId}</span> : null}
      </figcaption>
      <blockquote className="mb-reading-prose-inline m-0 text-[15px]">
        “{quote}”
      </blockquote>
    </figure>
  );
}
