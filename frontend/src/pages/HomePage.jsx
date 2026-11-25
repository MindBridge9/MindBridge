import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Camera, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/common';
import { useApi } from '../context/ApiContext';
import { usePage } from '../context/PageContext';
import { PREPROCESSED_SAMPLE_PAGE } from '../data/preprocessedSample';

const JOURNEY_STEPS = [
  { step: 'Scan', detail: 'Capture one printed page' },
  { step: 'Reshape', detail: 'Adjust font, spacing & speech' },
  { step: 'Understand', detail: 'Inspect SourceLens & terms' },
  { step: 'Explain', detail: 'Answer in your own words' },
  { step: 'Repair', detail: 'Fix misconceptions from source' },
  { step: 'Retry', detail: 'Try a fresh follow-up question' },
  { step: 'Independent Reading', detail: 'Return to original wording' },
];

export function HomePage({
  savedPages = [],
  onOpenSavedPage = null,
  onDeleteSavedPage = null,
  onClearAllSavedData = null,
}) {
  const navigate = useNavigate();
  const { health, healthStatus, refreshHealth } = useApi();
  const { page: activePage, setActivePage } = usePage();
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const handleOpenSample = () => {
    setActivePage(PREPROCESSED_SAMPLE_PAGE, null, {
      readability: 'readable',
      retakeReasons: [],
      origin: 'sample',
    });
    navigate(`/read/${PREPROCESSED_SAMPLE_PAGE.id}`);
  };

  const anyBackendAiEnabled = Boolean(
    health?.capabilities && Object.values(health.capabilities).some(Boolean)
  );

  return (
    <AppShell>
      <div className="mb-shell-container py-8 sm:py-12 flex flex-col gap-12">
        {/* Hero: Editorial learning thesis + illustrative loop spread */}
        <section
          aria-labelledby="home-heading"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start"
        >
          <div className="lg:col-span-6 flex flex-col gap-5">
            <h1
              id="home-heading"
              className="text-[34px] sm:text-[44px] font-extrabold tracking-[-0.025em] leading-[1.1] m-0 text-[#20372D]"
            >
              Every page understood. Not just read.
            </h1>
            <p className="text-[17px] leading-[1.65] text-[#3F584D] max-w-[54ch] m-0">
              MindBridge turns a photographed textbook page into an accessible reader, links every
              simplified idea back to the original wording, repairs misconceptions in your own
              explanation, and guides you back to independent reading.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="lg"
                icon={Camera}
                onClick={() => navigate('/scan')}
              >
                Scan or upload a page
              </Button>
              <Button
                variant="secondary"
                size="lg"
                icon={BookOpen}
                onClick={handleOpenSample}
              >
                Try preprocessed sample
              </Button>
            </div>

            <p className="text-[13px] text-[#3F584D] m-0">
              Built for Classes 6–10 students, second-language learners, and anyone who benefits from
              configurable reading support. No account required.
            </p>

            {/* Compact, honest server connectivity strip */}
            <div className="pt-2 border-t border-[#C9D2C8] flex flex-wrap items-center justify-between gap-2 text-[13px]">
              {healthStatus === 'pending' ? (
                <span className="text-[#3F584D]" role="status">
                  Checking MindBridge server status…
                </span>
              ) : healthStatus === 'error' ? (
                <>
                  <span className="inline-flex items-center gap-2 text-[#9A601C] font-medium" role="status">
                    <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                    Server offline — local sample reading &amp; settings remain available.
                  </span>
                  <Button variant="quiet" size="sm" icon={RefreshCw} onClick={refreshHealth}>
                    Retry connection
                  </Button>
                </>
              ) : health ? (
                <span className="text-[#3F584D]">
                  Server connected (API {health.api_version}) ·{' '}
                  {anyBackendAiEnabled
                    ? 'Live AI capabilities active'
                    : 'Live AI capabilities disabled by server configuration'}
                </span>
              ) : null}
            </div>
          </div>

          {/* Illustrative learning loop notebook spread (flat editorial structure, no nested cards) */}
          <aside
            aria-label="Illustrative MindBridge learning loop"
            className="lg:col-span-6 rounded-[12px] border border-[#8B9B91] bg-white overflow-hidden"
          >
            <div className="px-5 py-3.5 bg-[#EFECE0]/70 border-b border-[#C9D2C8] flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold m-0 text-[#20372D]">
                How MindBridge guides understanding
              </h2>
              <span className="text-[12px] font-semibold px-2.5 py-0.5 rounded-[4px] bg-white border border-[#C9D2C8] text-[#3F584D]">
                Illustrative example
              </span>
            </div>

            <div className="divide-y divide-[#C9D2C8]">
              <div className="p-5 flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#3F584D]">
                  1. Original textbook passage · c0002
                </span>
                <p className="font-[var(--mb-font-reading-lexend)] text-[17px] leading-[1.65] text-[#20372D] m-0">
                  “Green plants use light energy from sunlight to make glucose from carbon dioxide
                  and water during photosynthesis.”
                </p>
              </div>

              <div className="p-5 bg-[#FDF3E1]/45 flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9A601C]">
                  2. Student explanation &amp; misconception repair
                </span>
                <p className="text-[15px] font-semibold text-[#20372D] m-0">
                  “Plants get their food directly from sunlight.”
                </p>
                <p className="text-[14px] text-[#9A601C] m-0">
                  Possible misconception: confuses the energy source with the glucose produced.
                </p>
              </div>

              <div className="p-5 bg-[#E6F1EA]/55 flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#204C43]">
                  3. Grounded repair &amp; fresh retry question
                </span>
                <p className="text-[14px] text-[#20372D] m-0 leading-relaxed">
                  “Sunlight supplies energy. Plants use that energy to make glucose from carbon
                  dioxide and water.” Answer a fresh question, compare concepts, and return to the
                  original text.
                </p>
              </div>
            </div>
          </aside>
        </section>

        {/* Continue Learning / Active & Saved Pages */}
        {(activePage || savedPages.length > 0) && (
          <section aria-labelledby="continue-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="continue-heading" className="text-[22px] font-bold m-0 text-[#20372D]">
                Continue learning
              </h2>
              {savedPages.length > 0 && onClearAllSavedData ? (
                confirmClearAll ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[#A63D40]">
                      Remove all saved pages and learning sessions from this browser?
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onClearAllSavedData();
                        setConfirmClearAll(false);
                      }}
                    >
                      Clear all saved data
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => setConfirmClearAll(false)}
                    >
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="quiet"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setConfirmClearAll(true)}
                  >
                    Clear saved data
                  </Button>
                )
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              {activePage ? (
                <div className="rounded-[12px] border border-[#204C43] bg-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#204C43] m-0 mb-1">
                      Open in this session
                    </p>
                    <h3 className="text-[18px] font-bold m-0 text-[#20372D] truncate">
                      {activePage.title}
                    </h3>
                    <p className="text-[14px] text-[#3F584D] m-0 mt-1">
                      {activePage.chunks.length} sections ·{' '}
                      <span className="capitalize">{activePage.language}</span>
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    icon={ArrowRight}
                    onClick={() => navigate(`/read/${activePage.id}`)}
                  >
                    Return to reader
                  </Button>
                </div>
              ) : null}

              {savedPages.map((entry) => (
                <div
                  key={entry.page.id}
                  className="rounded-[12px] border border-[#8B9B91] bg-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#3F584D] m-0 mb-1">
                      Saved on this device ·{' '}
                      {new Date(entry.saved_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <h3 className="text-[18px] font-bold m-0 text-[#20372D] truncate">
                      {entry.page.title}
                    </h3>
                    <p className="text-[14px] text-[#3F584D] m-0 mt-1">
                      {entry.page.chunks.length} sections
                      {entry.learningSession
                        ? ` · ${entry.learningSession.attempts?.length || 0} saved attempt(s)`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onOpenSavedPage ? (
                      <Button
                        variant="secondary"
                        icon={BookOpen}
                        onClick={() => onOpenSavedPage(entry)}
                      >
                        Resume reading
                      </Button>
                    ) : null}
                    {onDeleteSavedPage ? (
                      <Button
                        variant="quiet"
                        onClick={() => onDeleteSavedPage(entry.page.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Journey sequence & core capabilities */}
        <section aria-labelledby="journey-heading" className="flex flex-col gap-6 border-t border-[#C9D2C8] pt-8">
          <div className="flex flex-col gap-1.5">
            <h2 id="journey-heading" className="text-[22px] font-bold m-0 text-[#20372D]">
              The learning journey
            </h2>
            <p className="text-[15px] text-[#3F584D] m-0">
              Your reading settings stay intact at every stage, and original textbook wording is
              never overwritten.
            </p>
          </div>

          <ol className="list-none p-0 m-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {JOURNEY_STEPS.map((item, index) => (
              <li
                key={item.step}
                className="rounded-[8px] border border-[#C9D2C8] bg-white px-3 py-2.5 flex flex-col gap-0.5"
              >
                <span className="mb-tabular text-[11px] font-bold text-[#204C43]">
                  Step {index + 1}
                </span>
                <span className="text-[14px] font-bold text-[#20372D]">{item.step}</span>
                <span className="text-[12px] text-[#3F584D] leading-snug">{item.detail}</span>
              </li>
            ))}
          </ol>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5 pt-2 m-0">
            <div>
              <dt className="text-[16px] font-bold text-[#20372D]">SourceLens</dt>
              <dd className="text-[14px] text-[#3F584D] m-0 mt-1 leading-relaxed">
                Compare any simplified section side-by-side with exact original textbook quotations
                and your captured page photo.
              </dd>
            </div>
            <div>
              <dt className="text-[16px] font-bold text-[#20372D]">FactGuard checks</dt>
              <dd className="text-[14px] text-[#3F584D] m-0 mt-1 leading-relaxed">
                Flags possible omissions or changes to numbers, units, dates, and key terms in
                simplified passages so you can verify against the original.
              </dd>
            </div>
            <div>
              <dt className="text-[16px] font-bold text-[#20372D]">
                Misconception Repair &amp; Independent Retry
              </dt>
              <dd className="text-[14px] text-[#3F584D] m-0 mt-1 leading-relaxed">
                Evaluates meaning rather than spelling, explains what was missed with source
                evidence, and offers a fresh follow-up question with transparent assistance tracking.
              </dd>
            </div>
            <div>
              <dt className="text-[16px] font-bold text-[#20372D]">Accessible reading tools</dt>
              <dd className="text-[14px] text-[#3F584D] m-0 mt-1 leading-relaxed">
                Adjust font, spacing, reading width, and Cream/Paper/Dark themes, listen
                sentence-by-sentence with highlighting, and look up terms in context.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </AppShell>
  );
}
