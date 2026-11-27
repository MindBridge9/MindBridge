import { motion } from 'motion/react';
import { useMotionPolicy } from '../components/motion/MotionSystem';
import { ContextDemo } from '../components/home/ContextDemo';
import { useState } from 'react';
import { ScrollProgress, StoryReveal, JourneyFlow, storyParts } from '../components/home/ScrollStory';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Camera, RefreshCw, Trash2, WifiOff, ScanLine, SlidersHorizontal, Link2, MessageCircle, Waypoints, RotateCcw, ShieldCheck, Volume2, Type } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/common';
import { ProductPreview } from '../components/home/ProductPreview';
import { RepairDemo } from '../components/home/RepairDemo';
import { useApi } from '../context/ApiContext';
import { usePage } from '../context/PageContext';
import { PREPROCESSED_SAMPLE_PAGE } from '../data/preprocessedSample';
const JOURNEY = [
 {name:'Scan',icon:ScanLine,detail:'Capture a page.'},
 {name:'Read',icon:BookOpen,detail:'Make it clearer.'},
 {name:'Practice',icon:MessageCircle,detail:'Test your understanding.'},
 {name:'Repair',icon:Waypoints,detail:'Fix misunderstandings.'},
 {name:'Retry',icon:RotateCcw,detail:'Try a new question.'},
];
export function HomePage({savedPages=[],onOpenSavedPage=null,onDeleteSavedPage=null,onClearAllSavedData=null}) {
 const navigate=useNavigate();
 const {instant}=useMotionPolicy();
 const canObserve=typeof IntersectionObserver!=='undefined';
 const {health,healthStatus,refreshHealth}=useApi();
 const {page:activePage,setActivePage}=usePage();
 const [confirmClearAll,setConfirmClearAll]=useState(false);
 const handleOpenSample=()=>{
  if(activePage&&activePage.id!==PREPROCESSED_SAMPLE_PAGE.id&&!window.confirm('Replace your open page and unfinished practice with the preprocessed sample?'))return;
  setActivePage(PREPROCESSED_SAMPLE_PAGE,null,{readability:'readable',retakeReasons:[],origin:'sample'});
  navigate(`/read/${PREPROCESSED_SAMPLE_PAGE.id}`);
 };
 return <AppShell><div className="mb-home mb-creative-home"><ScrollProgress />
  <div className="mb-shell-container mb-session-entry">
        {/* Continue Learning / Active & Saved Pages */}
        {(activePage || savedPages.length > 0) && (
          <section aria-labelledby="continue-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="continue-heading" className="text-[22px] font-bold m-0 text-[var(--mb-text)]">
                Continue learning
              </h2>
              {savedPages.length > 0 && onClearAllSavedData ? (
                confirmClearAll ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--mb-error)]">
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
                <div className="rounded-[12px] border border-[var(--mb-action)] bg-[var(--mb-surface)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-accent)] m-0 mb-1">
                      Open in this session
                    </p>
                    <h3 className="text-[18px] font-bold m-0 text-[var(--mb-text)] truncate">
                      {activePage.title}
                    </h3>
                    <p className="text-[14px] text-[var(--mb-text-muted)] m-0 mt-1">
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
                  className="rounded-[12px] border border-[var(--mb-border)] bg-[var(--mb-surface)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-text-muted)] m-0 mb-1">
                      Saved on this device ·{' '}
                      {new Date(entry.saved_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <h3 className="text-[18px] font-bold m-0 text-[var(--mb-text)] truncate">
                      {entry.page.title}
                    </h3>
                    <p className="text-[14px] text-[var(--mb-text-muted)] m-0 mt-1">
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

  </div>
  <section className="mb-shell-container mb-hero" aria-labelledby="home-heading">
   <div className="mb-hero-composition"><motion.div className="mb-hero-heading" initial={instant?false:{y:44}} animate={{y:0}} transition={{duration:instant?0:.55,ease:[.23,1,.32,1]}}><h1 id="home-heading">Every page understood.<br /><span>Not just read.</span></h1><div className="mb-hero-intro"><p>Read a clearer version. Trace it to the source. Explain it in your own words.</p><div className="mb-hero-actions"><Button size="lg" icon={ScanLine} onClick={()=>navigate('/scan')}>Scan or upload a page</Button><Button variant="secondary" size="lg" icon={ArrowRight} onClick={handleOpenSample}>Try a sample</Button></div></div></motion.div>
   <ProductPreview />
   </div>
   <div className="mb-connectivity mb-connectivity-compact" role="status">
    {healthStatus==='pending'?<span>Connecting…</span>:healthStatus==='error'?<><span><WifiOff size={14} aria-hidden="true" />Server unreachable · sample available</span><Button variant="quiet" size="sm" icon={RefreshCw} onClick={refreshHealth}>Retry connection</Button></>:health?<span title={`API ${health.api_version}. New AI actions depend on server capabilities and release approval.`}><span className="mb-status-dot" />Server connected</span>:null}
   </div>
  </section>
  <div className="mb-shell-container mb-home-body">
   <section id="how-it-works" className="mb-journey-section" data-story-reveal aria-labelledby="journey-heading">
    <div className="mb-section-heading"><h2 id="journey-heading">From reading to understanding.</h2></div>
    <JourneyFlow stages={JOURNEY} />
   </section>
   <StoryReveal id="learning" className="mb-repair-section" data-story-reveal aria-labelledby="repair-title">
    <motion.div variants={storyParts.copy} className="mb-feature-story"><h2 id="repair-title">Find the missing link.<br /><span>Then try again.</span></h2><p>Find the misunderstanding, revisit the source, then try a different question about the same idea.</p></motion.div>
    <RepairDemo />
   </StoryReveal>
   <StoryReveal className="mb-reading-feature" data-story-reveal aria-labelledby="comfort-title">
    <motion.div variants={storyParts.visual} className="mb-type-specimen" aria-label="Illustrative reading preferences"><div><Type size={22} aria-hidden="true" /><Volume2 size={20} aria-hidden="true" /></div><p>Big ideas.<br /><span>A little more space.</span><br />Your kind of clarity.</p><div className="mb-type-ruler" aria-hidden="true"><span>Aa</span><span>Aa</span><span>Aa</span><span>Aa</span></div></motion.div>
    <motion.div variants={storyParts.copy} className="mb-feature-story"><h2 id="comfort-title">Make room for<br />your way of reading.</h2><p>Adjust type, spacing, width, and theme across your learning tools. Read aloud with your browser’s available voices.</p><Button variant="secondary" icon={SlidersHorizontal} onClick={handleOpenSample}>Explore the accessible reader</Button></motion.div>
   </StoryReveal>
   <ContextDemo />
   <StoryReveal className="mb-factguard" data-story-reveal aria-labelledby="factguard-title"><ShieldCheck size={30} aria-hidden="true" /><motion.div variants={storyParts.copy}><h2 id="factguard-title">Clarity should keep the details.</h2><p>FactGuard flags possible missing or changed numbers, units, dates, and supplied terminology.</p><p className="mb-factguard-limit">It cannot check every change in meaning. No warnings does not guarantee accuracy.</p></motion.div><motion.div variants={storyParts.visual} className="mb-detail-comparison" aria-label="Illustrative detail comparison"><span>Illustrative detail comparison</span><dl><div><dt>Original detail</dt><dd>20 <span>mL</span></dd></div><div><dt>Detail to compare</dt><dd>20 <span>mL</span></dd></div></dl></motion.div></StoryReveal>
   <StoryReveal className="mb-final-cta" aria-labelledby="start-heading"><motion.div variants={storyParts.copy}><h2 id="start-heading">Start with one page.<br />See where it takes you.</h2><p>English printed textbook pages. A reading experience that puts understanding first.</p></motion.div><Button size="lg" icon={ArrowRight} onClick={()=>navigate('/scan')}>Bring your page</Button></StoryReveal>
  </div>
 </div></AppShell>;
}
