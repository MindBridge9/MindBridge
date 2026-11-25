import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  description = null,
  onClose,
  children,
  footer = null,
  size = 'md',
  className = '',
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        panel.focus();
      }
    };

    const rafId = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function'
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const widthClass =
    size === 'lg'
      ? 'max-w-[960px]'
      : size === 'sm'
        ? 'max-w-[420px]'
        : 'max-w-[600px]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20372D]/55 p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`mb-dialog-panel w-full ${widthClass} max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-[#F7F5ED] text-[#20372D] border border-[#8B9B91] rounded-t-[12px] sm:rounded-[12px] shadow-[var(--mb-shadow-overlay)] overflow-hidden ${className}`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-[#C9D2C8]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-bold m-0 text-[#20372D]">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="text-[14px] text-[#3F584D] m-0 mt-1">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            icon={X}
            label={`Close ${title}`}
            variant="quiet"
            onClick={onClose}
            className="text-[#20372D] hover:bg-[#DCE9DF]/65"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="px-5 py-3.5 bg-white border-t border-[#C9D2C8] flex flex-wrap justify-end gap-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
