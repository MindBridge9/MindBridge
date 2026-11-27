import { useState } from 'react';
import { motion } from 'motion/react';
import { useMotionPolicy } from '../motion/MotionSystem';
import { ChevronDown, Link2 } from 'lucide-react';
import { SourceQuote } from '../common';

export function SourceEvidence({ refs = [], label = 'Textbook evidence' }) {
  const {instant}=useMotionPolicy();
  const [open,setOpen]=useState(false);
  if (!Array.isArray(refs) || refs.length === 0) return null;
  return <details className="mb-source-disclosure" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><Link2 size={16} aria-hidden="true" /><span>{label}</span><ChevronDown size={16} aria-hidden="true" /></summary>
    <motion.div initial={false} animate={{y:open?0:-4}} transition={{duration:instant?0:.18}}>{refs.map((ref,idx)=><SourceQuote key={`${ref.chunk_id}-${idx}`} chunkId={ref.chunk_id} quote={ref.quote} label={label} />)}</motion.div>
  </details>;
}
