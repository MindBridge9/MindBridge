import { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button, Dialog, Notice } from '../common';

export function PhotoDialog({ open, imageUrl, title = 'Original page photograph', onClose }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <Dialog
      open={open}
      title={title}
      description="Compare extracted text against your original photograph."
      onClose={onClose}
      size="lg"
      footer={
        imageUrl ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={zoomed ? ZoomOut : ZoomIn}
              onClick={() => setZoomed((z) => !z)}
            >
              {zoomed ? 'Fit to window' : 'Zoom in'}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {imageUrl ? (
        <div className="bg-[var(--mb-surface-muted)] rounded-[6px] border border-[var(--mb-border-subtle)] p-3 overflow-auto max-h-[65vh] flex justify-center">
          <img
            src={imageUrl}
            alt="Uploaded textbook page photograph"
            className={
              zoomed
                ? 'max-w-none w-[150%] h-auto rounded-[4px]'
                : 'max-w-full max-h-[60vh] w-auto h-auto object-contain rounded-[4px]'
            }
          />
        </div>
      ) : (
        <Notice tone="info" title="No photograph attached">
          <p className="m-0">
            This page was opened without a local photograph (for example, the preprocessed sample or
            a restored text-only entry). Scan a textbook photograph to inspect the source image here.
          </p>
        </Notice>
      )}
    </Dialog>
  );
}
