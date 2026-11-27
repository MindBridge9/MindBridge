import { useRef, useState } from 'react';
import { BookOpen, ArrowUpRight, Link2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StoryReveal, storyParts } from './ScrollStory';
import { useMotionPolicy } from '../motion/MotionSystem';
export function ContextDemo() {
 const [open,setOpen]=useState(false);
 const trigger=useRef(null);
 const {instant}=useMotionPolicy();
 return <StoryReveal className="mb-context-story" aria-labelledby="context-title" data-story-reveal>
  <motion.div variants={storyParts.copy}><h2 id="context-title">A difficult word.<br />A small detour.<br /><span>Keep your place.</span></h2><p>Explore a word or idea without leaving the passage.</p></motion.div>
  <motion.div variants={storyParts.visual} className="mb-context-demo"><span className="mb-demo-label">Illustrative contextual definition</span><p>Plants use sunlight to make <button ref={trigger} type="button" aria-expanded={open} aria-controls="context-example" onClick={()=>setOpen(!open)}>glucose<ArrowUpRight size={16} aria-hidden="true" /></button>.</p>
   <AnimatePresence initial={false}>{open?<motion.div key="definition" initial={instant?false:{y:8}} animate={{y:0}} exit={{y:instant?0:3}} transition={{duration:instant?0:.18}} id="context-example" className="mb-context-definition"><div><BookOpen size={18} aria-hidden="true" /><h3>Glucose</h3><button type="button" aria-label="Close illustrative definition" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18} aria-hidden="true" /></button></div><p>A type of sugar that plants make during photosynthesis.</p><span><Link2 size={14} aria-hidden="true" /> In this example: “make glucose”</span></motion.div>:<motion.div key="placeholder" className="mb-context-placeholder" aria-hidden="true"><BookOpen size={24} /><span>Meaning, in context.</span></motion.div>}</AnimatePresence>
  </motion.div>
 </StoryReveal>;
}
