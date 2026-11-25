import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../common';
import { formatBytes } from '../../lib/image';

export function ImagePreviewCard({
  previewUrl,
  metadata,
  disabled = false,
  onRetake,
  onDiscard,
}) {
  if (!previewUrl || !metadata) return null;

  return (
    <div className="rounded-[12px] border border-[#8B9B91] bg-white overflow-hidden">
      <div className="bg-[#EFECE0] p-3 flex items-center justify-center max-h-[420px] overflow-hidden">
        <img
          src={previewUrl}
          alt="Selected textbook page preview"
          className="max-h-[396px] w-auto max-w-full object-contain rounded-[6px] border border-[#C9D2C8]"
        />
      </div>
      <div className="p-4 flex flex-col gap-3 border-t border-[#C9D2C8]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#3F584D]">
          <span className="font-semibold text-[#20372D] truncate max-w-[260px]">
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
    </div>
  );
}
