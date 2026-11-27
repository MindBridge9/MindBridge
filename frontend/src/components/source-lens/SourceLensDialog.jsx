import { AlertTriangle, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button, Dialog, Notice, SourceQuote } from '../common';

export function SourceLensDialog({
  open,
  originalChunk = null,
  generatedItem = null,
  keyTermsStatus = 'available',
  onOpenImage = null,
  onClose,
}) {
  if (!open) return null;

  const hasValidOutput = Boolean(originalChunk && generatedItem);
  const warningCount = generatedItem?.warnings?.length || 0;

  return (
    <Dialog
      open={open}
      title="SourceLens — Compare with original"
      description="Compare generated text with the original extracted passage. Exact extracted quotations have not been independently verified against the photograph."
      onClose={onClose}
      size="lg"
      className="mb-source-lens"
      footer={
        <>
          {onOpenImage ? (
            <Button variant="secondary" size="sm" icon={ImageIcon} onClick={onOpenImage}>
              View original photo
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {!hasValidOutput ? (
        <Notice tone="info" title="No simplified section selected">
          <p className="m-0">
            Simplify a clear section first to compare it against the original textbook passage.
          </p>
        </Notice>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Provenance summary strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-surface)] px-4 py-2.5 text-[13px]">
            <span className="font-semibold text-[var(--mb-text)]">
              Selected section · Simplified reading
            </span>
            <span className="mb-tabular font-semibold text-[var(--mb-text-muted)]">
              {warningCount > 0
                ? `${warningCount} FactGuard notice(s) to check`
                : generatedItem.terminology_check_status === 'checked'
                  ? 'No FactGuard omissions flagged'
                  : 'Terminology check unavailable'}
            </span>
          </div>

          {/* Side-by-side on desktop, stacked on mobile/tablet */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section
              aria-label="Original textbook passage"
              className="rounded-[12px] border border-[var(--mb-border)] mb-adaptive-paper bg-[var(--mb-surface)] p-5 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--mb-border-subtle)] pb-2">
                <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--mb-text-muted)]">
                  Original textbook wording
                </span>
                <span className="mb-tabular font-mono text-[12px] text-[var(--mb-text-muted)]">
                  {originalChunk.id}
                </span>
              </div>
              <p className="mb-reading-prose-inline m-0">
                {originalChunk.text}
              </p>
            </section>

            <section
              aria-label="Simplified text"
              className="rounded-[12px] border border-[var(--mb-action)] mb-adaptive-paper bg-[var(--mb-success-bg)]/45 p-5 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--mb-border)] pb-2">
                <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--mb-accent)]">
                  Simplified — AI-generated
                </span>
              </div>
              <p className="mb-reading-prose-inline m-0">
                {generatedItem.text}
              </p>
            </section>
          </div>

          {/* Terminology check availability (unavailable is never a clean pass) */}
          {generatedItem.terminology_check_status === 'unavailable' ||
          keyTermsStatus === 'unavailable' ? (
            <Notice tone="warning" title="Terminology check unavailable">
              <p className="m-0">
                Key-term metadata was unavailable for this section, so term preservation could not be
                checked automatically. Numbers and units were still checked, but verify important
                terms against the original passage.
              </p>
            </Notice>
          ) : null}

          {/* FactGuard omission / change warnings */}
          {warningCount > 0 ? (
            <Notice tone="warning" title="FactGuard: possible omissions or changes to verify">
              <p className="m-0 mb-2">
                Compare these details with the original passage. FactGuard flags possible missing or changed
                details to double-check—it is not a complete guarantee of factual accuracy.
              </p>
              <ul className="m-0 pl-0 list-none flex flex-col gap-2">
                {generatedItem.warnings.map((warning, idx) => (
                  <li
                    key={`${warning.code}-${idx}`}
                    className="rounded-[6px] border border-[var(--mb-warning)]/45 mb-adaptive-paper bg-[var(--mb-surface)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="font-semibold text-[14px] text-[var(--mb-text)]">
                      {warning.message}
                    </span>
                    <span className="mb-tabular text-[13px] text-[var(--mb-text-muted)]">
                      Original: <strong className="text-[var(--mb-text)]">“{warning.source_value}”</strong>{' '}
                      → Simplified:{' '}
                      <strong className="text-[var(--mb-warning)]">
                        {warning.generated_value ? `“${warning.generated_value}”` : 'Absent'}
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            </Notice>
          ) : generatedItem.terminology_check_status === 'checked' ? (
            <div className="rounded-[6px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-surface)] px-4 py-3 flex items-start gap-2.5 text-[14px] text-[var(--mb-text)]">
              <CheckCircle2 className="w-4 h-4 text-[var(--mb-success)] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                No missing numbers, units, dates, or supplied key terms were flagged by FactGuard.
                FactGuard checks for missing or changed details, rather than guaranteeing factual accuracy—always
                verify meaning against the original wording.
              </span>
            </div>
          ) : (
            <div className="rounded-[6px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-surface)] px-4 py-3 flex items-start gap-2.5 text-[14px] text-[var(--mb-text)]">
              <AlertTriangle className="w-4 h-4 text-[var(--mb-warning)] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                No numeric or unit omissions flagged; verify vocabulary directly with the original
                passage.
              </span>
            </div>
          )}

          {/* Preserved terms */}
          {Array.isArray(generatedItem.preserved_terms) &&
          generatedItem.preserved_terms.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] font-semibold text-[var(--mb-text-muted)] m-0">
                Preserved source key terms
              </p>
              <div className="flex flex-wrap gap-1.5">
                {generatedItem.preserved_terms.map((term) => (
                  <span
                    key={term}
                    className="px-2.5 py-1 rounded-[4px] bg-[var(--mb-support)] text-[var(--mb-text)] text-[13px] font-semibold"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Exact source quotations */}
          {Array.isArray(generatedItem.source_refs) && generatedItem.source_refs.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-[var(--mb-text-muted)] m-0">
                Exact source quotations cited
              </p>
              {generatedItem.source_refs.map((ref, idx) => (
                <SourceQuote
                  key={`${ref.chunk_id}-${idx}`}
                  chunkId={ref.chunk_id}
                  quote={ref.quote}
                  label="Source quotation"
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
