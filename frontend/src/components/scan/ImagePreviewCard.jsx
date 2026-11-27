import { motion } from 'motion/react';
import { useMotionPolicy } from '../motion/MotionSystem';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../common';
import { formatBytes } from '../../lib/image';

export function ImagePreviewCard({
  previewUrl,
  metadata,
  disabled = false,
  processing = false,
  onRetake,
  onDiscard,
}) {
  const {instant}=useMotionPolicy();
  if (!previewUrl || !metadata) return null;

  return (
    <motion.div initial={instant?false:{y:10}} animate={{y:0}} transition={{duration:instant?0:.22}} data-processing={processing} className="mb-image-preview rounded-[12px] border border-[var(--mb-border)] bg-[var(--mb-surface)] overflow-hidden">
      <div className="mb-scan-image-stage bg-[var(--mb-surface-muted)] p-3 flex items-center justify-center max-h-[420px] overflow-hidden">
        <img
          src={previewUrl}
          alt="Selected textbook page preview"
          className="max-h-[396px] w-auto max-w-full object-contain rounded-[6px] border border-[var(--mb-border-subtle)]"
        />
        {processing ? <div className="mb-scan-sweep" aria-hidden="true"><span /></div> : null}
      </div>
      <div className="p-4 flex flex-col gap-3 border-t border-[var(--mb-border-subtle)]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--mb-text-muted)]">
          <span className="font-semibold text-[var(--mb-text)] truncate max-w-[260px]">
            {metadata.fileName}
          </span>
          <span className="mb-tabular">
            {metadata.width} × {metadata.height} px · {formatBytes(metadata.processedSize)}
            {metadata.compressed ? ` (resized from ${formatBytes(metadata.originalSize)})` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            disabled={disabled}
            onClick={onRetake}
          >
            Choose another photo
          </Button>
          <Button
            variant="quiet"
            size="sm"
            icon={Trash2}
            disabled={disabled}
            onClick={onDiscard}
          >
            Discard
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
