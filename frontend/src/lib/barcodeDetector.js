/**
 * A barcode detector that exists on every device the shop might use.
 *
 * Chrome ships BarcodeDetector natively, but only on Android, ChromeOS and
 * macOS. On Windows and Linux desktop Chrome, and on every iPhone and iPad
 * (Safari, and every other iOS browser, which are all Safari underneath), the
 * constructor simply is not there. The camera opened, the preview looked
 * perfect, and nothing was ever decoded -- which is exactly what a broken
 * scanner looks like from behind the counter.
 *
 * So: use the native one where it exists, because it is hardware-accelerated
 * and costs nothing to ship, and otherwise load a WebAssembly build of ZXing.
 * The fallback is a dynamic import, so the ~900 KB of decoder is only fetched
 * by the devices that actually need it, and never by the Android phone that is
 * the common case.
 *
 * The wasm is served from our own origin, not a CDN. Same reason the fonts are
 * self-hosted: a shop's scanning should not tell a third party anything, and it
 * has to keep working when the connection does not.
 */

/** The symbologies on Indian retail packaging, plus what a handheld prints. */
export const FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf',
];

// Loading the wasm twice would be a waste; every caller shares one promise.
let fallbackPromise = null;

export function nativeDetectorAvailable() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Which of our formats the native detector will actually accept.
 *
 * Asking matters: passing an unsupported format to the constructor throws, and
 * a native detector that cannot do ean_13 is no use in a grocery shop -- better
 * to fall back to wasm than to run a detector that will never fire.
 */
async function nativeFormats() {
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    return FORMATS.filter((format) => supported.includes(format));
  } catch {
    return [];
  }
}

async function loadFallback() {
  fallbackPromise ||= (async () => {
    const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    // Without this the library fetches its wasm from a public CDN.
    setZXingModuleOverrides({
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    });
    return BarcodeDetector;
  })();
  return fallbackPromise;
}

/**
 * A detector, and which engine produced it.
 *
 * Throws only if the fallback itself cannot load -- an offline first visit, or
 * a network that blocks wasm. Callers should treat that as "typing only".
 */
export async function createDetector() {
  if (nativeDetectorAvailable()) {
    const formats = await nativeFormats();
    if (formats.includes('ean_13')) {
      try {
        return { detector: new window.BarcodeDetector({ formats }), engine: 'native' };
      } catch {
        // Present but unusable. Fall through to the wasm build.
      }
    }
  }

  const BarcodeDetector = await loadFallback();
  return { detector: new BarcodeDetector({ formats: FORMATS }), engine: 'fallback' };
}

/**
 * Why the camera would not open, in words a shopkeeper can act on.
 *
 * The insecure-context case is the one that catches people out: the app works
 * on the counter laptop at localhost, then the same URL typed into a phone on
 * the shop wi-fi has no camera at all, because browsers only hand it out over
 * https.
 */
export function cameraProblem(err) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'insecure';
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-camera';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'unknown';
  }
}
