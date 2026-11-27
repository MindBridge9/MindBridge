import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, RefreshCw, SwitchCamera, ImagePlus, Check } from 'lucide-react';
import { Button, Dialog, Notice } from '../common';
import { useMotionPolicy } from '../motion/MotionSystem';

const cameraError = (error) => {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return 'Camera access was blocked. Allow camera access in your browser’s site settings, then try again. You can also upload a photo.';
  if (error?.name === 'NotFoundError') return 'No camera was found. Connect a camera or upload a photo from your device.';
  if (error?.name === 'NotReadableError') return 'The camera is busy or unavailable. Close other apps using it, then try again.';
  if (error?.name === 'OverconstrainedError') return 'That camera is no longer available. Reopen the camera or upload a photo.';
  return 'The camera could not start. Check your browser and device camera settings, or upload a photo.';
};

// Mounted only after Take photo. Late permission results are always released.
export function CameraDialog({ onClose, onUsePhoto, onGallery }) {
  const { instant } = useMotionPolicy();
  const video = useRef(null);
  const stream = useRef(null);
  const generation = useRef(0);
  const [phase, setPhase] = useState('opening');
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const release = useCallback(() => {
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const start = useCallback(async (selectedDevice = '') => {
    const request = ++generation.current;
    release(); setReady(false); setPhoto(null); setError(null); setPhase('opening');
    if (window.isSecureContext === false) {
      setError('Camera access needs HTTPS or localhost. Open MindBridge using a secure address, or upload a photo.'); setPhase('error'); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Live camera capture is not supported in this browser. Try an up-to-date browser, or upload a photo.'); setPhase('error'); return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(selectedDevice ? { deviceId: { exact: selectedDevice } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1920 }, height: { ideal: 1440 },
      } });
      if (request !== generation.current) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      const track = next.getVideoTracks()[0];
      setDeviceId(track?.getSettings().deviceId || selectedDevice);
      if (track) track.onended = () => { release(); setReady(false); setError('Camera access ended. Try again or upload a photo.'); setPhase('error'); };
      video.current.srcObject = next;
      await video.current.play();
      if (request !== generation.current) return;
      setPhase('live');
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (request === generation.current) setDevices(available.filter(device => device.kind === 'videoinput'));
      } catch { /* Camera capture still works without device enumeration. */ }
    } catch (err) {
      if (request !== generation.current) return;
      release(); setError(cameraError(err)); setPhase('error');
    }
  }, [release]);
  useEffect(() => {
    let active = true;
    // Avoid duplicate permission requests during React StrictMode effect replay.
    queueMicrotask(() => { if (active) start(); });
    const leave = () => { generation.current += 1; release(); };
    window.addEventListener('pagehide', leave);
    return () => { active = false; leave(); window.removeEventListener('pagehide', leave); };
  }, [start, release]);
  useEffect(() => {
    if (!photo) { setPhotoUrl(null); return; }
    const url = URL.createObjectURL(photo); setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const capture = () => {
    const frame = video.current;
    if (phase !== 'live' || !frame?.videoWidth || !frame?.videoHeight) return;
    const request = ++generation.current;
    try {
      const canvas = document.createElement('canvas');
      // Keep capture within the existing image preparation limits.
      const ratio = Math.min(1, 2400 / Math.max(frame.videoWidth, frame.videoHeight));
      canvas.width = Math.round(frame.videoWidth * ratio); canvas.height = Math.round(frame.videoHeight * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('capture');
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      release(); setReady(false); setPhase('capturing');
      canvas.toBlob(blob => {
        if (request !== generation.current) return;
        if (!blob) { setError('The photo could not be captured. Retake it or upload a photo.'); setPhase('error'); return; }
        setPhoto(new File([blob], 'mindbridge-camera.jpg', { type: 'image/jpeg' })); setPhase('captured');
      }, 'image/jpeg', .92);
    } catch {
      release(); setError('The photo could not be captured. Try again or upload a photo.'); setPhase('error');
    }
  };
  return <Dialog open title="Capture a textbook page" description="Frame one page in good light. The photo stays on this device until you choose Read this page." onClose={onClose} size="lg" className="mb-camera-dialog">
    <div className="mb-camera-stage" data-camera-phase={phase}>
      <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" onLoadedData={() => setReady(true)} hidden={phase === 'captured' || phase === 'error'} />
      {phase === 'live' ? <div className="mb-camera-guides" aria-hidden="true"><i /><i /><i /><i /></div> : null}
      <AnimatePresence initial={false}>
        {photoUrl && phase === 'captured' ? <motion.img key="capture" src={photoUrl} alt="Captured textbook page" initial={instant ? false : { opacity: .5, scale: .98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: instant ? 0 : .18 }} /> : null}
      </AnimatePresence>
      {phase === 'opening' || phase === 'capturing' ? <p role="status" className="mb-camera-status">{phase === 'opening' ? 'Opening camera… Allow access if your browser asks.' : 'Preparing your photo…'}</p> : null}
      {phase === 'error' ? <Notice tone="error" title="Camera unavailable"><p>{error}</p></Notice> : null}
    </div>
    <div className="mb-camera-actions">
      {phase === 'live' ? <><p>Keep all page edges inside the guides.</p><div>{devices.length > 1 ? <Button variant="secondary" icon={SwitchCamera} onClick={() => start(devices[(Math.max(0, devices.findIndex(device => device.deviceId === deviceId)) + 1) % devices.length].deviceId)}>Switch camera</Button> : null}<Button icon={Camera} size="lg" disabled={!ready} onClick={capture}>Capture photo</Button></div></> : null}
      {phase === 'captured' ? <div><Button variant="secondary" icon={RefreshCw} onClick={() => start(deviceId)}>Retake photo</Button><Button icon={Check} disabled={!photo} onClick={() => onUsePhoto(photo)}>Use this photo</Button></div> : null}
      {phase === 'error' ? <Button variant="secondary" icon={RefreshCw} onClick={() => start()}>Try camera again</Button> : null}
      <Button variant="quiet" icon={ImagePlus} onClick={onGallery}>Upload a photo instead</Button>
    </div>
  </Dialog>;
}
