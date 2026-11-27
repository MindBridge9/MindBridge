import { useRef, useSyncExternalStore } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { useMotionPolicy } from '../motion/MotionSystem';

const desktopQuery = '(min-width: 1024px)';
function subscribeDesktop(callback) {
  const query = window.matchMedia?.(desktopQuery);
  query?.addEventListener('change', callback);
  return () => query?.removeEventListener('change', callback);
}
const readDesktop = () => Boolean(window.matchMedia?.(desktopQuery).matches);

export function useStoryScroll(target, offset = ['start end', 'end center']) {
  const { instant } = useMotionPolicy();
  const desktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false);
  const { scrollYProgress } = useScroll({ target, offset });
  return { progress: scrollYProgress, still: instant, desktop };
}

export function ScrollProgress() {
  const { instant } = useMotionPolicy();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {stiffness:220,damping:35});
  return instant ? null : <motion.div className="mb-scroll-progress" style={{ scaleX: smoothProgress }} aria-hidden="true" />;
}

export const storyParts = {
  copy: { waiting: { y: 36, x: -18, opacity: 1 }, visible: { y: 0, x: 0, opacity: 1 } },
  visual: { waiting: { y: 64, x: 26, scale: .94, opacity: 1 }, visible: { y: 0, x: 0, scale: 1, opacity: 1 } },
};
export function StoryReveal({ children, className = '', ...props }) {
  const { instant } = useMotionPolicy();
  const observe = typeof IntersectionObserver !== 'undefined';
  return <motion.section {...props} className={className} data-story-reveal initial={instant || !observe ? false : 'waiting'}
    animate={instant ? 'visible' : undefined} whileInView={observe ? 'visible' : undefined}
    variants={{visible:{transition:{staggerChildren:instant?0:.075}}}} viewport={{ once: true, amount: .12 }}
    transition={{ duration: instant ? 0 : .5, ease: [.23, 1, .32, 1] }}>
    {children}
  </motion.section>;
}

function JourneyStage({ index, name, Icon, detail, progress, still }) {
  const start = index * .16;
  const y = useTransform(progress, [start, start + .32], [24, 0]);
  const scale = useTransform(progress, [start, start + .32], [.88, 1]);
  const color = useTransform(progress, [start, start + .16, start + .32], ['var(--mb-text-muted)', 'var(--mb-accent)', 'var(--mb-text)']);
  return <motion.li data-journey-stage={name} style={{ color: still ? 'var(--mb-text)' : color }}>
    <motion.span className="mb-journey-node" style={{ scale: still ? 1 : scale }}><Icon size={28} aria-hidden="true" /></motion.span>
    <motion.strong style={{ y: still ? 0 : y }}>{name}</motion.strong><motion.p style={{ y: still ? 0 : y }}>{detail}</motion.p>
  </motion.li>;
}

export function JourneyFlow({ stages }) {
  const target = useRef(null);
  const { progress, still } = useStoryScroll(target, ['start 90%', 'end 40%']);
  const smoothProgress = useSpring(progress, { stiffness: 180, damping: 30 });
  const horizontal = useSyncExternalStore(subscribeJourneyLayout, readJourneyLayout, () => false);
  return <div ref={target} className="mb-journey-track mb-journey-five">
    <div className="mb-journey-line" aria-hidden="true"><motion.span style={{ scaleX: still || !horizontal ? 1 : smoothProgress, scaleY: still || horizontal ? 1 : smoothProgress }} /></div>
    <ol className="mb-journey">{stages.map(({ name, icon: Icon, detail }, index) => <JourneyStage key={name} name={name} Icon={Icon} detail={detail} index={index} progress={smoothProgress} still={still} />)}</ol>
  </div>;
}
const journeyLayoutQuery = '(min-width: 768px)';
function subscribeJourneyLayout(callback) {
  const query = window.matchMedia?.(journeyLayoutQuery);
  query?.addEventListener('change', callback);
  return () => query?.removeEventListener('change', callback);
}
const readJourneyLayout = () => Boolean(window.matchMedia?.(journeyLayoutQuery).matches);
