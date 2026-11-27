import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { usePreferences } from '../../context/PreferencesContext';
import { MotionConfig, motion } from 'motion/react';

const InputContext = createContext({ keyboard: false, reduced: false });
const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(callback) {
  const query = window.matchMedia?.(motionQuery);
  query?.addEventListener('change', callback);
  return () => query?.removeEventListener('change', callback);
}
const readMotion = () => Boolean(window.matchMedia?.(motionQuery).matches);

export function MotionSystem({ children }) {
  const [keyboard, setKeyboard] = useState(false);
  const {preferences} = usePreferences();
  const systemReduced = useSyncExternalStore(subscribeMotion, readMotion, () => true);
  const reduced = systemReduced || Boolean(preferences.reduce_motion);
  useEffect(() => {
    const key = () => setKeyboard(true);
    const pointer = () => setKeyboard(false);
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, []);
  return <InputContext.Provider value={{ keyboard, reduced }}>
    <MotionConfig reducedMotion={reduced || keyboard ? 'always' : 'never'} transition={{ duration: .22, ease: [.23, 1, .32, 1] }}>
      {children}
    </MotionConfig>
  </InputContext.Provider>;
}
export function useMotionPolicy() {
  const { keyboard, reduced } = useContext(InputContext);
  return { instant: keyboard || reduced, keyboard, reduced };
}
export function StageSurface({ stage, children, ...props }) {
  const { instant } = useMotionPolicy();
  return <motion.div {...props} key={stage} initial={instant ? false : { y: 8 }} animate={{ y: 0 }} transition={{ duration: instant ? 0 : .22 }}>{children}</motion.div>;
}
