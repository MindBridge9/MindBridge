import { useState, useRef, forwardRef } from 'react';
import { motion, AnimatePresence, useIsPresent, useTransform } from 'motion/react';
import { ArrowUpRight, Check, Link2, ArrowRight } from 'lucide-react';
import { SegmentedControl } from '../common';
import { useStoryScroll } from './ScrollStory';
import { useMotionPolicy } from '../motion/MotionSystem';

const spring={type:'spring',duration:.5,bounce:.12};
const scene={easy:{transition:{staggerChildren:.065}},original:{transition:{staggerChildren:.065}},rest:{}};
const paper={rest:{y:54,rotate:-12},easy:{y:0,rotate:-7},original:{y:0,rotate:-2}};
const explanation={rest:{y:76,rotate:5},easy:{y:0,rotate:0},original:{y:8,rotate:0}};
const PreviewText=forwardRef(function PreviewText({mode,instant,children},ref) {
 const present=useIsPresent();
 return <motion.div ref={ref} data-preview-transition data-mode={mode} aria-hidden={!present} initial={instant?false:{transform:'translateY(10px)'}} animate={{transform:instant?'none':'translateY(0px)'}} exit={{transform:instant?'none':'translateY(-4px)'}} transition={{duration:instant?0:.22}}>{children}</motion.div>;
});
export function ProductPreview() {
 const [mode,setMode]=useState('easy');const [evidence,setEvidence]=useState(true);
 const {instant}=useMotionPolicy();
 const target=useRef(null);
 const {progress,still,desktop}=useStoryScroll(target,['start start','end start']);
 const bookY=useTransform(progress,[0,1],[0,desktop?-90:-24]);
 const bookX=useTransform(progress,[0,1],[0,desktop?-32:0]);
 const sheetY=useTransform(progress,[0,1],[0,desktop?-150:-40]);
 const sheetX=useTransform(progress,[0,1],[0,desktop?24:0]);
 const sourceDraw=useTransform(progress,[0,.6],[.25,1]);
 const sourceEnd=useTransform(sourceDraw,[.85,1],[0,1]);
 const transition=instant?{duration:0}:spring;
 return <section ref={target} className="mb-product-preview mb-art-preview" aria-label="Interactive illustrative reading demonstration">
  <div className="mb-preview-top"><span className="mb-demo-label">Illustrative sample · no live AI</span></div>
  <motion.div className="mb-art-stage" variants={instant?{}:scene} initial={instant?false:"rest"} animate={mode}>
   <div className="mb-art-orbit" aria-hidden="true" /><div className="mb-art-sky" aria-hidden="true" />
   <motion.div className="mb-book-scroll" data-scroll-object="textbook" style={{x:still?0:bookX,y:still?0:bookY}}><motion.div className="mb-textbook" variants={paper} transition={transition} whileHover={instant?undefined:{rotate:-3,y:-4}}>
    <div className="mb-textbook-binding" aria-hidden="true" />
    <svg viewBox="0 0 230 126" className="mb-botany-diagram" aria-label="Sunlight reaches a plant" role="img">
     <circle cx="38" cy="34" r="14" fill="var(--mb-art-peach)" stroke="var(--mb-art-peach-ink)" strokeWidth="1.5" />
     <path d="M38 8v5m0 42v5M12 34h5m42 0h5M19 15l4 4m30 30 4 4M19 53l4-4m30-30 4-4" stroke="var(--mb-art-peach-ink)" strokeWidth="1.5" strokeLinecap="round" />
     <path d="M164 111V56m0 27c-25 0-38-13-38-29 24 0 38 11 38 29Zm0-14c23 0 37-13 37-30-23 0-37 12-37 30Z" fill="var(--mb-art-mint)" stroke="var(--mb-art-mint-ink)" strokeWidth="2" strokeLinejoin="round" />
     <motion.path d="M68 36c25 0 38 8 48 22" fill="none" stroke="var(--mb-art-peach-ink)" strokeWidth="1.5" strokeDasharray="4 5" initial={false} animate={{pathLength:mode==='easy'?1:.4}} transition={{duration:instant?0:.5}} />
     <path d="m109 55 8 4-1-9" fill="none" stroke="var(--mb-art-peach-ink)" strokeWidth="1.5" />
     <path d="M123 112h83" stroke="var(--mb-art-mint-ink)" strokeWidth="1.5" />
    </svg>
    <h2>Photosynthesis</h2>
    <p>Green plants use <mark>light energy from sunlight</mark> to make <mark>glucose</mark> from carbon dioxide and water during photosynthesis.</p>
   </motion.div></motion.div>
   <svg className="mb-art-connection" viewBox="0 0 600 510" fill="none" aria-hidden="true"><motion.path d="M220 160C240 82 290 78 330 105" stroke="var(--mb-accent)" strokeWidth="2" strokeLinecap="round" data-source-scroll style={{pathLength:still?1:sourceDraw,opacity:evidence?1:0}} /><motion.circle cx="330" cy="105" r="5" fill="var(--mb-accent)" style={{opacity:evidence?(still?1:sourceEnd):0}} animate={{scale:evidence?1:0}} transition={{duration:instant?0:.2}} /></svg>
   <motion.div className="mb-sheet-scroll" data-scroll-object="simplified" style={{x:still?0:sheetX,y:still?0:sheetY}}><motion.div className="mb-art-explanation" layout={!instant} variants={explanation} whileHover={instant?undefined:{y:-4}} transition={transition}>
    <div className="mb-preview-toolbar"><SegmentedControl label="Preview reading mode" value={mode} onChange={setMode} options={[{value:'original',label:'Original'},{value:'easy',label:'Simplified'}]} /></div>
    <AnimatePresence mode="popLayout" initial={false}>
     <PreviewText key={mode} mode={mode} instant={instant}>
      <h3>{mode==='easy'?'Same idea. More clarity.':'Start with the source.'}</h3>
      <p className="mb-preview-text" data-motion-engine="motion" aria-live="polite">{mode==='original'?<>Green plants use <mark>light energy from sunlight</mark> to make <mark>glucose</mark> from carbon dioxide and water during photosynthesis.</>:<>Plants use sunlight for <mark>energy</mark>. They turn carbon dioxide and water into <mark>glucose</mark> — a type of sugar. This process is called photosynthesis.</>}</p>
     </PreviewText>
    </AnimatePresence>
    <div className="mb-preview-provenance"><button type="button" aria-expanded={evidence} aria-controls="preview-evidence" onClick={()=>setEvidence(!evidence)}><Link2 size={15} aria-hidden="true" />{evidence?'Hide source':'Inspect source'}<ArrowUpRight size={14} aria-hidden="true" /></button></div>
   </motion.div></motion.div>
   <motion.div className="mb-art-term" aria-hidden="true" initial={instant?false:{y:12,rotate:7}} animate={{y:0,rotate:4}} transition={transition}><strong>glucose <Check size={16} /></strong></motion.div>
  </motion.div>
  <AnimatePresence initial={false}>
   {evidence?<motion.aside key="evidence" layout={!instant} id="preview-evidence" className="mb-preview-evidence mb-art-evidence" initial={instant?false:{y:8}} animate={{y:0}} exit={{y:instant?0:4}} transition={{duration:instant?0:.2}}>
    <div className="mb-evidence-title"><Link2 size={18} aria-hidden="true" /><h3>SourceLens</h3></div>
    <blockquote>“Green plants use <mark>light energy from sunlight</mark> to make <mark>glucose</mark> from carbon dioxide and water during photosynthesis.”</blockquote>
    <small>Illustrative quotation. Extracted text is not independently verified against the photograph.</small>
   </motion.aside>:null}
  </AnimatePresence>
  <div className="mb-preview-question"><a href="#learning">Explore the repair loop <ArrowRight size={15} aria-hidden="true" /></a></div>
 </section>;
}
