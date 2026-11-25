import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ImagePlus, RefreshCw, ShieldAlert, Upload } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, LoadingStatus, Notice } from '../components/common';
import { ImagePreviewCard } from '../components/scan/ImagePreviewCard';
import { RetakeGuidance } from '../components/scan/RetakeGuidance';
import { prepareScanImage } from '../lib/image';
import { readPage } from '../lib/api';
import { useApiRequest } from '../hooks/useApiRequest';
import { useApi } from '../context/ApiContext';
import { usePage } from '../context/PageContext';
import { describeAvailabilityReason } from '../config/features';

export function ScanPage() {
  const navigate = useNavigate();
  const { getFeatureState, healthStatus, refreshHealth } = useApi();
  const { setActivePage } = usePage();

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [prepared, setPrepared] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [retakeReasons, setRetakeReasons] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const readRequest = useApiRequest(readPage);
  const readAvailability = getFeatureState('read');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const clearSelection = () => {
    readRequest.reset();
    setRetakeReasons([]);
    setFileError(null);
    setPrepared(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const processSelectedFile = async (file) => {
    if (!file) return;

    setFileError(null);
    setRetakeReasons([]);
    readRequest.reset();
    setPreparingImage(true);

    try {
      const result = await prepareScanImage(file);
      const nextUrl = URL.createObjectURL(result.blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setPrepared(result);
    } catch (err) {
      setFileError(
        err?.message || 'This image could not be prepared. Choose a JPEG, PNG, or WebP photograph.'
      );
    } finally {
      setPreparingImage(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    // File cancellation is harmless; preserve existing preview if user cancelled picker
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (readRequest.status === 'pending' || preparingImage) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await processSelectedFile(file);
    }
  };

  const handleConfirmUpload = async () => {
    if (!prepared || !readAvailability.available) return;
    setRetakeReasons([]);

    const outcome = await readRequest.run(prepared.blob);
    if (!outcome?.ok) return;

    const result = outcome.data;
    if (result.readability === 'unreadable' || !result.page) {
      setRetakeReasons(
        Array.isArray(result.retake_reasons) && result.retake_reasons.length > 0
          ? result.retake_reasons
          : ['no_printed_text']
      );
      return;
    }

    setActivePage(result.page, prepared.blob, {
      readability: result.readability,
      retakeReasons: result.retake_reasons || [],
      origin: 'live',
    });
    navigate(`/read/${result.page.id}`);
  };

  const isUploading = readRequest.status === 'pending';

  return (
    <AppShell>
      <div className="mb-shell-container py-8 sm:py-10">
        <div className="max-w-[960px] mx-auto flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-[-0.02em] m-0 text-[#20372D]">
              Scan a textbook page
            </h1>
            <p className="text-[16px] text-[#3F584D] max-w-[62ch] m-0">
              Take a photo or upload one JPEG, PNG, or WebP image of a single printed English
              textbook page.
            </p>
          </div>

          {!readAvailability.available ? (
            <Notice
              tone={readAvailability.reason === 'health_unknown' ? 'info' : 'warning'}
              title="Page reading service unavailable"
              actions={
                readAvailability.reason === 'health_unreachable' ||
                readAvailability.reason === 'health_unknown' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RefreshCw}
                    loading={healthStatus === 'pending'}
                    onClick={refreshHealth}
                  >
                    Recheck server status
                  </Button>
                ) : null
              }
            >
              <p className="m-0">
                {describeAvailabilityReason(readAvailability.reason, 'Textbook scanning')}
              </p>
              <p className="m-0 mt-1 text-[13px] text-[#3F584D]">
                You can still select and preview a photo here, or open the labelled sample page from
                Home to test accessible reading and speech.
              </p>
            </Notice>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section
              aria-label="Photo selection and preview"
              className="lg:col-span-7 flex flex-col gap-4"
            >
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleFileChange}
                className="sr-only"
                id="scan-camera-input"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
                id="scan-gallery-input"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-[12px] border-2 border-dashed p-5 sm:p-6 flex flex-col gap-4 transition-colors duration-150 ${
                  isDragging
                    ? 'border-[#204C43] bg-[#DCE9DF]/55'
                    : 'border-[#8B9B91] bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-[6px] bg-[#DCE9DF] text-[#204C43] flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold m-0 text-[#20372D]">
                      Choose or drop a page photograph
                    </h2>
                    <p className="text-[13px] text-[#3F584D] m-0 mt-1">
                      JPEG, PNG, or WebP up to 20 MiB (automatically resized to fit 8 MiB). Camera
                      capture opens your device camera when supported.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    icon={Camera}
                    disabled={isUploading || preparingImage}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    Take photo
                  </Button>
                  <Button
                    variant="secondary"
                    icon={ImagePlus}
                    disabled={isUploading || preparingImage}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    Upload from device
                  </Button>
                </div>
              </div>

              {preparingImage ? (
                <LoadingStatus message="Preparing image preview and checking dimensions…" />
              ) : null}

              {fileError ? (
                <Notice tone="error" title="Could not use this file">
                  <p className="m-0">{fileError}</p>
                </Notice>
              ) : null}

              {prepared && previewUrl ? (
                <ImagePreviewCard
                  previewUrl={previewUrl}
                  metadata={prepared}
                  disabled={isUploading}
                  onRetake={() => galleryInputRef.current?.click()}
                  onDiscard={clearSelection}
                />
              ) : null}

              {isUploading ? (
                <LoadingStatus
                  message="Reading textbook text…"
                  detail="Extracting headings, paragraphs, and key terms. This can take up to 90 seconds."
                  onCancel={() => readRequest.cancel()}
                  cancelLabel="Cancel waiting"
                />
              ) : null}

              {readRequest.status === 'error' && readRequest.error ? (
                <Notice
                  tone="error"
                  title="Could not read this page"
                  actions={
                    readRequest.error.retryable && readAvailability.available ? (
                      <Button variant="primary" size="sm" onClick={handleConfirmUpload}>
                        Try again
                      </Button>
                    ) : null
                  }
                >
                  <p className="m-0">{readRequest.error.message}</p>
                  {readRequest.error.retryAfterSeconds ? (
                    <p className="m-0 mt-1 text-[13px] font-semibold">
                      Wait at least {readRequest.error.retryAfterSeconds} seconds before retrying.
                    </p>
                  ) : null}
                  {readRequest.error.requestId ? (
                    <p className="m-0 mt-1 text-[12px] text-[#3F584D] font-mono">
                      Request ID: {readRequest.error.requestId}
                    </p>
                  ) : null}
                </Notice>
              ) : null}

              <RetakeGuidance
                reasons={retakeReasons}
                onRetake={() => galleryInputRef.current?.click()}
              />

              {prepared ? (
                <div className="rounded-[12px] border border-[#8B9B91] bg-[#DCE9DF]/45 p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-2.5 text-[13px] text-[#20372D]">
                    <ShieldAlert
                      className="w-4 h-4 text-[#204C43] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <p className="m-0">
                      <strong>External AI disclosure:</strong> Confirming sends this textbook image
                      to the server’s configured external AI provider (Groq or Google Gemini) to
                      extract text. Avoid uploading pages containing personal names or private
                      details.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="primary"
                      size="lg"
                      loading={isUploading}
                      disabled={!readAvailability.available || preparingImage}
                      onClick={handleConfirmUpload}
                    >
                      Read this page
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <aside
              aria-label="Tips for a clear textbook scan"
              className="lg:col-span-5 rounded-[12px] border border-[#C9D2C8] bg-white p-5 flex flex-col gap-3"
            >
              <h2 className="text-[18px] font-bold m-0 text-[#20372D]">
                For accurate extraction
              </h2>
              <ul className="m-0 pl-5 space-y-2 text-[14px] text-[#3F584D]">
                <li>Place the textbook flat in even daylight or room light.</li>
                <li>Frame one English printed page at a time without cutting off edges.</li>
                <li>Hold steady to keep small units, numbers, and scientific terms sharp.</li>
                <li>
                  MindBridge always keeps extracted original wording separate from AI summaries and
                  simplified text, and lets you inspect your original photo anytime.
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
