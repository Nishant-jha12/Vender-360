import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Rear-camera barcode scanning, built on the browser's own BarcodeDetector.
 *
 * No scanner library: Chrome on Android is what a kirana shop actually holds,
 * and it ships the detector natively. Where it is missing (iOS Safari, Firefox)
 * the hook says so honestly via `supported` and the page falls back to typing
 * the number -- which is also the path a USB scanner takes, since those behave
 * as keyboards.
 *
 *   const { videoRef, supported, running, error, start, stop } =
 *     useBarcodeScanner({ onDetect: (code) => ... });
 */

// A camera sees the same barcode on every frame. Anything sooner than this is
// the same box still sitting in front of the lens, not a second scan of it.
const REPEAT_GUARD_MS = 2000;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

export function useBarcodeScanner({ onDetect, scanIntervalMs = 300 } = {}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const timerRef = useRef(null);
  const lastHitRef = useRef({ code: '', at: 0 });
  // Kept in a ref so restarting the loop is never needed just because the
  // page re-rendered with a new callback identity.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    // Or the lamp stays on after the camera closes.
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  /** Back rooms are dim, and the lamp is already on the track we hold. */
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Some devices advertise torch and then refuse it; stop offering.
      setTorchSupported(false);
    }
  }, [torchOn]);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Type the barcode instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setRunning(true);
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() ?? {};
      setTorchSupported("torch" in capabilities);
    } catch {
      setError('Camera unavailable or permission denied. Type the barcode instead.');
      return;
    }

    if (!supported) return; // Preview still helps the shopkeeper aim; typing does the rest.

    try {
      detectorRef.current ||= new window.BarcodeDetector({ formats: FORMATS });
    } catch {
      detectorRef.current = null;
      return;
    }

    timerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !detectorRef.current) return;
      try {
        const found = await detectorRef.current.detect(video);
        const code = found?.[0]?.rawValue?.trim();
        if (!code) return;

        const now = Date.now();
        const { code: lastCode, at } = lastHitRef.current;
        if (code === lastCode && now - at < REPEAT_GUARD_MS) return;
        lastHitRef.current = { code, at: now };

        onDetectRef.current?.(code);
      } catch {
        // A dropped frame is not worth surfacing; the next tick tries again.
      }
    }, scanIntervalMs);
  }, [supported, scanIntervalMs]);

  useEffect(() => stop, [stop]);

  /** Let the same barcode count again straight away (after an undo, say). */
  const clearRepeatGuard = useCallback(() => {
    lastHitRef.current = { code: '', at: 0 };
  }, []);

  return {
    videoRef, supported, running, error, start, stop, clearRepeatGuard,
    torchOn, torchSupported, toggleTorch,
  };
}
