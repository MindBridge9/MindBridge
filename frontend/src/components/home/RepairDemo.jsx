import { useState, useRef } from 'react';
import { ArrowRight, CornerDownRight, Link2, RotateCcw, Check } from 'lucide-react';
import { Button } from '../common';
import { motion, useTransform } from 'motion/react';
import { useStoryScroll } from './ScrollStory';
import { useMotionPolicy } from '../motion/MotionSystem';
export function RepairDemo() {
 const [retry,setRetry]=useState(false);
 const [comparison,setComparison]=useState(false);
 const {instant}=useMotionPolicy();
 const target=useRef(null);
 const {progress,still,desktop}=useStoryScroll(target,['start end','center center']);
 const answerY=useTransform(progress,[0,1],[desktop?56:28,0]);
 const repairY=useTransform(progress,[0,1],[desktop?88:44,0]);
 return <div ref={target} className="mb-repair-demo">
  <div className="mb-demo-top"><span>Misconception Repair</span><span className="mb-demo-label">Illustrative responses</span></div>
  <motion.div style={{y:still?0:answerY}} className="mb-demo-answer"><p>“Plants get their food directly from sunlight.”</p><span className="mb-demo-misconception">Possible misconception · energy and food are different</span></motion.div>
  <motion.div style={{y:still?0:repairY}}><div className="mb-demo-repair"><CornerDownRight size={22} aria-hidden="true" /><div><h3>A useful distinction</h3><p>Sunlight is the <strong>energy source</strong>, not the food. Plants use that energy to make <strong>glucose</strong>.</p><span className="mb-demo-source"><Link2 size={14} aria-hidden="true" /> Source: “make glucose from carbon dioxide and water”</span></div></div>
  <motion.div layout={instant?false:"position"} className="mb-demo-next" aria-live="polite">
   {retry ? <><h3>A different question. The same concept.</h3><p>What does sunlight provide, and what do plants make using it?</p>{comparison ? <motion.div initial={instant?false:{y:8}} animate={{y:0}} transition={{duration:instant?0:.22}} className="mb-demo-comparison"><span>Illustrative follow-up answer</span><p>“Sunlight provides energy. Plants use it to make glucose.”</p><div><Check size={17} aria-hidden="true" /><span>The energy source and the food are now distinguished in this example.</span></div></motion.div> : <Button variant="secondary" icon={ArrowRight} onClick={()=>setComparison(true)}>Compare illustrative answers</Button>}<span>Retries use the same understanding criteria. Any help opened is recorded.</span><Button variant="quiet" size="sm" icon={RotateCcw} onClick={()=>{setRetry(false);setComparison(false);}}>Replay example</Button></> : <Button variant="secondary" icon={ArrowRight} onClick={()=>setRetry(true)}>See the follow-up question</Button>}
  </motion.div></motion.div>
 </div>;
}
