import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraProblem, createDetector, nativeDetectorAvailable } from '../lib/barcodeDetector';

/**
 * Rear-camera barcode scanning.
 *
 * Decoding comes from `../lib/barcodeDetector`: the browser's own detector
 * where it exists, a WebAssembly ZXing build everywhere else. This used to
 * depend on the native detector alone, which meant scanning silently did
 * nothing on Windows and Linux desktops and on every iPhone and iPad -- the
 * camera opened, the picture was sharp, and no barcode ever registered.
 *
 * Typing still works alongside it, and is also the path a handheld USB or
 * bluetooth scanner takes, since those behave as keyboards.
 *
 *   const { videoRef, running, error, start, stop } =
 *     useBarcodeScanner({ onDetect: (code) => ... });
 */

// A camera sees the same barcode on every frame. Anything sooner than this is
// the same box still sitting in front of the lens, not a second scan of it.
const REPEAT_GUARD_MS = 2000;

export function useBarcodeScanner({ onDetect, scanIntervalMs = 250 } = {}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  // 'idle' | 'loading' | 'native' | 'fallback' | 'unavailable'
  const [engine, setEngine] = useState('idle');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const stoppedRef = useRef(true);
  const lastHitRef = useRef({ code: '', at: 0 });
  // Kept in a ref so restarting the loop is never needed just because the
  // page re-rendered with a new callback identity.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
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

  /**
   * One decode, then schedule the next.
   *
   * Deliberately not setInterval: a wasm decode on an old phone can outlast the
   * tick, and overlapping decodes would queue up until the tab stutters.
   */
  const tick = useCallback(
    async (intervalMs) => {
      timerRef.current = null;
      if (stoppedRef.current) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && detectorRef.current && !busyRef.current) {
        busyRef.current = true;
        try {
          const found = await detectorRef.current.detect(video);
          const code = found?.[0]?.rawValue?.trim();
          if (code) {
            const now = Date.now();
            const { code: lastCode, at } = lastHitRef.current;
            if (code !== lastCode || now - at >= REPEAT_GUARD_MS) {
              lastHitRef.current = { code, at: now };
              onDetectRef.current?.(code);
            }
          }
        } catch {
          // A dropped frame is not worth surfacing; the next tick tries again.
        } finally {
          busyRef.current = false;
        }
      }

      if (!stoppedRef.current) {
        timerRef.current = setTimeout(() => tick(intervalMs), intervalMs);
      }
    },
    [],
  );

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError('');
    setProblem('');
    stoppedRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      const reason = cameraProblem(null);
      setProblem(reason);
      setError(
        reason === 'insecure'
          ? 'The camera needs a secure connection. Open the app over https, or on this device itself.'
          : 'This browser cannot open the camera. Type the barcode instead.',
      );
      return;
    }

    // Fetch the decoder while the shopkeeper is still pointing the camera, so
    // the first barcode in front of the lens is already being read.
    setEngine((current) => (current === 'idle' ? 'loading' : current));
    const decoderReady = createDetector().then(
      ({ detector, engine: kind }) => {
        detectorRef.current = detector;
        setEngine(kind);
        return true;
      },
      () => {
        // Offline on a device with no native detector: aiming still helps, and
        // the number can be typed.
        detectorRef.current = null;
        setEngine('unavailable');
        return false;
      },
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // A barcode is small in the frame; asking for more pixels than the
          // default 640x480 is what makes an EAN-13 readable at arm's length.
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (stoppedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setRunning(true);
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() ?? {};
      setTorchSupported('torch' in capabilities);
    } catch (err) {
      const reason = cameraProblem(err);
      setProblem(reason);
      setError(
        {
          insecure: 'The camera needs a secure connection. Open the app over https, or on this device itself.',
          denied: 'Camera permission was refused. Allow it in the browser address bar, then try again.',
          'no-camera': 'No camera was found on this device. Type the barcode instead.',
          'in-use': 'Another app is using the camera. Close it, then try again.',
        }[reason] || 'The camera could not be opened. Type the barcode instead.',
      );
      stoppedRef.current = true;
      return;
    }

    await decoderReady;
    if (!stoppedRef.current && detectorRef.current) tick(scanIntervalMs);
  }, [scanIntervalMs, tick]);

  useEffect(() => stop, [stop]);

  /** Let the same barcode count again straight away (after an undo, say). */
  const clearRepeatGuard = useCallback(() => {
    lastHitRef.current = { code: '', at: 0 };
  }, []);

  return {
    videoRef,
    running,
    error,
    problem,
    start,
    stop,
    clearRepeatGuard,
    torchOn,
    torchSupported,
    toggleTorch,
    engine,
    // Can this device decode at all? Only false once the fallback has failed.
    supported: engine !== 'unavailable',
    native: nativeDetectorAvailable(),
  };
}
