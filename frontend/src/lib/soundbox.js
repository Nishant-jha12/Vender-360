/**
 * UPI Soundbox Audio & Vernacular Announcement Engine for Vendor360
 * 
 * Features:
 * 1. Web Audio API synthesized hardware chime (Zero external audio file dependencies, works 100% offline).
 * 2. Web Speech API (speechSynthesis) multilingual voice announcements across Hindi, Marathi, Bengali, English.
 * 3. Automatic voice selection and fallback handling.
 */

// LocalStorage Keys
const STORAGE_ENABLED = 'vendor360_soundbox_enabled';
const STORAGE_LANG = 'vendor360_soundbox_lang';
const STORAGE_VOLUME = 'vendor360_soundbox_volume';

let audioContextInstance = null;

function getAudioContext() {
  if (!audioContextInstance) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContextInstance = new AudioCtx();
    }
  }
  if (audioContextInstance && audioContextInstance.state === 'suspended') {
    audioContextInstance.resume().catch(() => {});
  }
  return audioContextInstance;
}

/**
 * Synthesizes the signature electronic soundbox double/triple chime using Web Audio API
 */
export function playSoundboxChime(volume = 1.0) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const effectiveVol = Math.max(0, Math.min(1, volume));
    const now = ctx.currentTime;

    // Chime notes: D5 (587.33 Hz) -> A5 (880.00 Hz) -> D6 (1174.66 Hz)
    const notes = [
      { freq: 587.33, start: now, duration: 0.15 },
      { freq: 880.00, start: now + 0.12, duration: 0.18 },
      { freq: 1174.66, start: now + 0.26, duration: 0.45 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      // Primary carrier oscillator (sine wave for clarity)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      // Secondary overtone for warm hardware body
      const overtone = ctx.createOscillator();
      overtone.type = 'triangle';
      overtone.frequency.setValueAtTime(freq * 2, start);

      // Gain Envelope
      const gainNode = ctx.createGain();
      const overtoneGain = ctx.createGain();

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.exponentialRampToValueAtTime(0.4 * effectiveVol, start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      overtoneGain.gain.setValueAtTime(0.0001, start);
      overtoneGain.gain.exponentialRampToValueAtTime(0.08 * effectiveVol, start + 0.02);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.7);

      osc.connect(gainNode);
      overtone.connect(overtoneGain);

      gainNode.connect(ctx.destination);
      overtoneGain.connect(ctx.destination);

      osc.start(start);
      overtone.start(start);

      osc.stop(start + duration + 0.05);
      overtone.stop(start + duration + 0.05);
    });
  } catch (err) {
    console.warn('[Soundbox] Could not synthesize chime:', err);
  }
}

/**
 * Formats rupee amount for speech text
 */
function formatRupeesForSpeech(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
}

/**
 * Builds vernacular announcement text
 */
export function getAnnouncementText(amount, lang = 'hi-IN', payerName = null) {
  const formattedAmt = formatRupeesForSpeech(amount);
  const cleanPayer = payerName && payerName.trim() ? payerName.trim() : null;

  switch (lang) {
    case 'hi-IN':
    case 'hi':
      if (cleanPayer) {
        return `${cleanPayer} से वेंडर 360 पर ${formattedAmt} रुपये प्राप्त हुए`;
      }
      return `वेंडर 360 पर ${formattedAmt} रुपये प्राप्त हुए`;

    case 'mr-IN':
    case 'mr':
      if (cleanPayer) {
        return `${cleanPayer} कडून वेंडर 360 वर ${formattedAmt} रुपये प्राप्त झाले`;
      }
      return `वेंडर 360 वर ${formattedAmt} रुपये प्राप्त झाले`;

    case 'bn-IN':
    case 'bn':
      if (cleanPayer) {
        return `${cleanPayer}-এর থেকে ভেন্ডার 360-এ ${formattedAmt} টাকা পাওয়া গেছে`;
      }
      return `ভেন্ডার 360-এ ${formattedAmt} টাকা পাওয়া গেছে`;

    case 'en-IN':
    case 'en':
    default:
      if (cleanPayer) {
        return `Received ${formattedAmt} rupees from ${cleanPayer} on Vendor 360`;
      }
      return `Received ${formattedAmt} rupees on Vendor 360`;
  }
}

/**
 * Selects best TTS voice for target language
 */
function findBestVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const targetPrefix = lang.split('-')[0].toLowerCase();

  // 1. Exact match e.g. hi-IN
  let match = voices.find(v => v.lang && v.lang.toLowerCase() === lang.toLowerCase());
  if (match) return match;

  // 2. Language prefix match (e.g. 'hi')
  match = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(targetPrefix));
  if (match) return match;

  // 3. Fallback for Indian English
  if (targetPrefix === 'en') {
    match = voices.find(v => v.lang && v.lang.toLowerCase().includes('en-in'));
    if (match) return match;
  }

  // 4. Any default voice
  return voices.find(v => v.default) || voices[0];
}

/**
 * Speaks the soundbox voice announcement using Web Speech API
 */
export function speakAnnouncement({ amount, lang = 'hi-IN', volume = 1.0, payerName = null }) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any pending speech

      const text = getAnnouncementText(amount, lang, payerName);
      const utterance = new SpeechSynthesisUtterance(text);

      utterance.lang = lang;
      utterance.volume = Math.max(0, Math.min(1, volume));
      utterance.rate = 0.95; // Slightly measured soundbox tempo
      utterance.pitch = 1.05; // Crisp announcer tone

      const voice = findBestVoice(lang);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        console.warn('[Soundbox] Speech synthesis warning:', e);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[Soundbox] Speech error:', e);
      resolve();
    }
  });
}

/**
 * Complete Soundbox Announcement: Chime -> Vernacular Speech
 */
export async function announcePayment({ amount, lang = null, volume = null, payerName = null }) {
  const settings = getSoundboxSettings();
  if (!settings.enabled) return;

  const targetLang = lang || settings.lang || 'hi-IN';
  const targetVolume = volume !== null ? volume : settings.volume;

  // 1. Hardware chime
  playSoundboxChime(targetVolume);

  // 2. Vernacular voice announcement after slight chime lead
  await new Promise(r => setTimeout(r, 450));
  await speakAnnouncement({
    amount,
    lang: targetLang,
    volume: targetVolume,
    payerName,
  });
}

/**
 * Retrieve persistent soundbox settings
 */
export function getSoundboxSettings() {
  try {
    const enabled = localStorage.getItem(STORAGE_ENABLED) !== 'false';
    const lang = localStorage.getItem(STORAGE_LANG) || 'hi-IN';
    const rawVol = localStorage.getItem(STORAGE_VOLUME);
    const volume = rawVol !== null ? parseFloat(rawVol) : 1.0;
    return { enabled, lang, volume: isNaN(volume) ? 1.0 : volume };
  } catch {
    return { enabled: true, lang: 'hi-IN', volume: 1.0 };
  }
}

/**
 * Save persistent soundbox settings
 */
export function saveSoundboxSettings(settings) {
  try {
    if (typeof settings.enabled === 'boolean') {
      localStorage.setItem(STORAGE_ENABLED, String(settings.enabled));
    }
    if (settings.lang) {
      localStorage.setItem(STORAGE_LANG, settings.lang);
    }
    if (typeof settings.volume === 'number') {
      localStorage.setItem(STORAGE_VOLUME, String(settings.volume));
    }
  } catch (e) {
    console.warn('[Soundbox] Could not persist settings:', e);
  }
}

/**
 * Helper to test the soundbox with a simulated payment amount
 */
export async function testSoundboxVoice(amount = 150, lang = null) {
  const settings = getSoundboxSettings();
  const testLang = lang || settings.lang;
  await announcePayment({
    amount,
    lang: testLang,
    volume: settings.volume,
    payerName: 'Ramesh',
  });
}
