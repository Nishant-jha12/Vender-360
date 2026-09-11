import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../lib/api';
import { qty as fmtQty } from '../lib/format';
import { useToast } from '../components/Toast';

// Every language offered in Account must appear here, or voice logging listens
// in English while the rest of the screen is not.
const LANG_MAP = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN' };

/**
 * Speak a stock change, confirm it, then save.
 *
 * The old flow sent the transcript straight to an endpoint that took the first
 * number it found and applied it to whichever product came back first from the
 * database -- "sold 5 bread" added 5 milk, silently. Nothing is written now
 * until the shopkeeper confirms what was understood.
 */
export default function VoiceEntry() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [status, setStatus] = useState('idle'); // idle | listening | interpreting | confirming | saving
  const [transcript, setTranscript] = useState('');
  const [interpretation, setInterpretation] = useState(null);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recognitionRef.current?.abort?.();
  }, []);

  const interpret = async (spoken) => {
    setStatus('interpreting');
    try {
      const res = await api.post('/inventory/voice-entry', { transcript: spoken, commit: false });
      setInterpretation(res.data);
      setStatus('confirming');
    } catch (err) {
      toast.error(errorMessage(err));
      setStatus('idle');
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    // Follows the chosen app language instead of being pinned to en-IN.
    recognition.lang = LANG_MAP[i18n.language] || 'en-IN';

    recognition.onstart = () => {
      setStatus('listening');
      setTranscript('');
      setInterpretation(null);
    };
    recognition.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
    };
    recognition.onerror = (event) => {
      toast.error(
        event.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it in your browser settings.'
          : 'Could not hear that. Try again.',
      );
      setStatus('idle');
    };
    recognition.onend = () => {
      setTranscript((current) => {
        if (current.trim()) interpret(current);
        else setStatus('idle');
        return current;
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const save = async () => {
    if (!interpretation?.item_id) return;
    setStatus('saving');
    try {
      const signedQty = interpretation.qty * interpretation.direction;
      const res = await api.post('/inventory/voice-entry', {
        transcript,
        commit: true,
        item_id: interpretation.item_id,
        qty: signedQty,
      });
      toast.success(`${res.data.sku_name}: now ${fmtQty(res.data.new_qty)}`);
      setStatus('idle');
      setTranscript('');
      setInterpretation(null);
    } catch (err) {
      toast.error(errorMessage(err));
      setStatus('confirming');
    }
  };

  const reset = () => {
    setStatus('idle');
    setTranscript('');
    setInterpretation(null);
  };

  const listening = status === 'listening';

  if (!supported) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <Mic className="mx-auto text-brand-muted mb-4 opacity-40" size={44} />
        <h2 className="text-lg font-bold text-brand-ink">{t('voice_extra.not_supported')}</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pt-6 pb-24 px-4 max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold text-brand-ink font-inter">{t('voice_extra.title')}</h2>
        <p className="text-sm text-brand-muted mt-2">
          {status === 'idle' && t('voice_extra.tap_mic_hint')}
          {listening && t('voice_extra.listening')}
          {status === 'interpreting' && t('voice_extra.interpreting')}
          {status === 'confirming' && t('voice_extra.confirming')}
          {status === 'saving' && t('voice_extra.saving')}
        </p>
      </div>

      <div className="relative mb-8">
        {listening && (
          <>
            <span className="absolute inset-0 bg-brand-amber/30 rounded-full animate-ping scale-150" />
            <span className="absolute inset-0 bg-brand-amber/20 rounded-full animate-pulse scale-125" />
          </>
        )}
        <button
          onClick={listening ? () => recognitionRef.current?.stop() : startListening}
          disabled={status === 'interpreting' || status === 'saving'}
          aria-label={listening ? 'Stop listening' : 'Start voice entry'}
          className="relative z-10 w-24 h-24 rounded-full bg-brand-amber text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-brand-amber/40 outline-none"
        >
          {status === 'interpreting' || status === 'saving' ? (
            <Loader2 size={38} className="animate-spin" />
          ) : (
            <Mic size={38} />
          )}
        </button>
      </div>

      {transcript && (
        <p className="text-center text-brand-ink text-lg italic mb-5">“{transcript}”</p>
      )}

      {status === 'confirming' && interpretation && (
        <div className="w-full bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-sm">
          {interpretation.understood ? (
            <>
              <p className="text-sm font-bold text-brand-ink text-center">
                {interpretation.direction < 0 ? t('voice_extra.remove_direction') : t('voice_extra.add_direction')}{' '}
                <span className="text-brand-primary">{fmtQty(interpretation.qty)}</span>
                {interpretation.direction < 0 ? ` ${t('voice_extra.from')} ` : ` ${t('voice_extra.to')} `}
                <span className="text-brand-primary">{interpretation.sku_name}</span>
              </p>
              <p className="text-[11px] text-brand-muted text-center mt-1.5">
                Match confidence {Math.round(interpretation.confidence * 100)}%
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-brand-ink text-center">
              {interpretation.message}
            </p>
          )}

          {/* A near-miss is one tap from correct rather than a retry. */}
          <div className="mt-4">
            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">Product</label>
            <select
              value={interpretation.item_id || ''}
              onChange={(e) => {
                const chosen = interpretation.candidates.find((c) => c.id === e.target.value);
                setInterpretation({
                  ...interpretation,
                  item_id: e.target.value,
                  sku_name: chosen?.sku_name,
                  understood: Boolean(e.target.value),
                });
              }}
              className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">Choose a product</option>
              {interpretation.candidates?.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.sku_name} ({fmtQty(candidate.current_qty)} in stock)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">Quantity</span>
              <input
                type="number" step="any" min="0" value={interpretation.qty}
                onChange={(e) => setInterpretation({ ...interpretation, qty: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-bold text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">Direction</span>
              <select
                value={interpretation.direction}
                onChange={(e) => setInterpretation({ ...interpretation, direction: Number(e.target.value) })}
                className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value={1}>Stock came in</option>
                <option value={-1}>Stock went out</option>
              </select>
            </label>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={reset} className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-ink font-semibold flex items-center justify-center gap-2 bg-brand-bg text-sm">
              <X size={17} /> Cancel
            </button>
            <button
              onClick={save}
              disabled={!interpretation.item_id || !interpretation.qty}
              className="flex-1 py-3 rounded-2xl bg-brand-primary text-brand-on-primary font-semibold flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <Check size={17} /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
