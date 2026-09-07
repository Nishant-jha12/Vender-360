import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Camera, CameraOff, Check, ChevronDown, FileText, Flashlight, Loader2,
  PackageOpen, Scan, Search, Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../lib/api';
import { money, qty as fmtQty } from '../lib/format';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useToast } from '../components/Toast';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';
import IntakeItemSheet from '../components/IntakeItemSheet';
import IntakeSummary from '../components/IntakeSummary';

/**
 * Stock intake: scan the delivery in.
 *
 * A loose packet is one scan, one unit, written straight away -- there is
 * nothing to ask. A carton is one scan and a whole case, so it stops and shows
 * what is in the box before it touches stock. Nothing here guesses: an
 * unrecognised barcode says so and offers to create the product.
 *
 * When the delivery is done, the session prints or saves as a goods-received
 * note with batch, dates and the GST split, for the input-tax claim.
 */
export default function ScanReceipt() {
  const { t } = useTranslation();
  const toast = useToast();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sheet, setSheet] = useState(null); // { suggestion } | { barcode }
  const [manualCode, setManualCode] = useState('');
  const [closing, setClosing] = useState(false);

  // A scan in flight, or an open sheet, must not be interrupted by the next
  // frame the camera decodes.
  const busyRef = useRef(false);
  const sheetRef = useRef(null);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/intake/session/current');
      setSession(res.data || null);
      setError(null);
    } catch (err) {
      if (err?.response?.status !== 401) setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitCode = useCallback(
    async (rawCode) => {
      const code = String(rawCode || '').trim();
      if (!code || busyRef.current || sheetRef.current) return;
      busyRef.current = true;
      try {
        const { data } = await api.post('/intake/scan', { barcode: code });
        if (data.status === 'applied') {
          tone('ok');
          toast.success(data.message);
          await refresh();
        } else if (data.status === 'confirm') {
          tone('ok');
          setSheet({ suggestion: data.suggestion });
        } else {
          tone('unknown');
          // The scan already carried back whatever the barcode itself and the
          // open product database knew, so the form opens mostly filled in.
          setSheet({
            barcode: data.barcode || code,
            found: data.product || null,
            details: data.details || null,
          });
          if (data.product) toast.success(data.message);
        }
      } catch (err) {
        tone('unknown');
        toast.error(errorMessage(err));
      } finally {
        busyRef.current = false;
      }
    },
    [refresh, toast],
  );

  const scanner = useBarcodeScanner({ onDetect: submitCode });
  const {
    videoRef, supported, running, error: cameraError, start, stop, clearRepeatGuard,
    torchOn, torchSupported, toggleTorch, engine,
  } = scanner;

  const undoLine = async (line) => {
    try {
      await api.delete(`/intake/lines/${line.id}`);
      clearRepeatGuard();
      toast.success(`${line.sku_name} taken back off`);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const finish = async () => {
    if (!session) return;
    setClosing(true);
    try {
      const { data } = await api.post(`/intake/session/${session.id}/close`);
      stop();
      setSummary(data);
      setSession(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setClosing(false);
    }
  };

  const startAnother = async () => {
    setSummary(null);
    setLoading(true);
    await refresh();
  };

  if (summary) {
    return (
      <div className="max-w-3xl mx-auto pb-24 space-y-4">
        <Header
          className="no-print"
          title={t('scan.received_title')}
          subtitle={t('scan.received_subtitle')}
        />
        <IntakeSummary summary={summary} onNewDelivery={startAnother} />
      </div>
    );
  }

  const lines = session?.lines || [];
  const runningTotal = lines.reduce((sum, line) => sum + (line.line_total || 0), 0);
  const unitTotal = lines.reduce((sum, line) => sum + (line.qty_units || 0), 0);

  return (
    <div className="max-w-3xl mx-auto pb-28 space-y-4">
      <Header
        title={t('scan.title')}
        subtitle={t('scan.subtitle')}
      />

      <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-sm">
        <div className="relative bg-black aspect-[4/3] sm:aspect-[16/9]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${running ? '' : 'opacity-0'}`}
          />
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 px-6 text-center gap-3">
              <Camera size={38} className="opacity-70" />
              <button
                onClick={() => {
                  unlockAudio();
                  start();
                }}
                className="bg-white/95 text-black text-sm font-bold px-5 py-3 rounded-2xl focus-visible:ring-2 focus-visible:ring-white outline-none"
              >
                {t('scan.start_camera')}
              </button>
              {cameraError && <p className="text-xs text-white/70 max-w-xs">{cameraError}</p>}
            </div>
          )}
          {running && (
            <>
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-white/70 rounded-xl pointer-events-none" />
              <div className="absolute top-3 right-3 flex gap-2">
                {torchSupported && (
                  <button
                    onClick={toggleTorch}
                    aria-pressed={torchOn}
                    aria-label={torchOn ? 'Turn the light off' : 'Turn the light on'}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
                      torchOn ? 'bg-white text-black' : 'bg-black/60 text-white'
                    }`}
                  >
                    <Flashlight size={13} /> {t('scan.light')}
                  </button>
                )}
                <button
                  onClick={stop}
                  className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                >
                  <CameraOff size={13} /> {t('scan.stop')}
                </button>
              </div>
              <p className="absolute bottom-3 inset-x-0 text-center text-[11px] text-white/80">
                {engine === 'loading'
                  ? t('scan.reader_loading')
                  : supported
                    ? t('scan.aim_hint')
                    : t('scan.aim_hint_manual')}
              </p>
            </>
          )}
        </div>

        {running && !supported && (
          <p className="text-[11px] text-brand-muted px-4 pt-3">{t('scan.reader_unavailable')}</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            unlockAudio();
            submitCode(manualCode);
            setManualCode('');
          }}
          className="flex gap-2 p-3"
        >
          <div className="relative flex-1">
            <Scan size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            {/* A USB/bluetooth scanner types the digits and presses Enter, so it
                lands here without any extra handling. */}
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                // Not all of these send a key the form treats as a submit, so
                // the Enter a scanner types is handled explicitly.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitCode(manualCode);
                  setManualCode('');
                }
              }}
              inputMode="numeric"
              autoComplete="off"
              aria-label={t('scan.barcode_number')}
              placeholder={t('scan.barcode_number')}
              className="w-full bg-brand-bg border border-brand-border rounded-2xl pl-9 pr-3 py-2.5 text-sm font-mono text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="px-4 rounded-2xl bg-brand-primary text-brand-on-primary text-sm font-bold disabled:opacity-50"
          >
            {t('common.add')}
          </button>
        </form>
      </div>

      <NoBarcodePicker onPick={(item) => setSheet({ suggestion: suggestionFor(item) })} />

      {loading ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : lines.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title={t('scan.nothing_scanned')}
          description={t('scan.nothing_scanned_hint')}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-sm font-bold text-brand-ink font-inter">
              In this delivery ({lines.length})
            </h3>
            <p className="text-xs text-brand-muted">
              {fmtQty(unitTotal)} units · {money(runningTotal)}
            </p>
          </div>

          {[...lines].reverse().map((line) => (
            <div
              key={line.id}
              className="bg-brand-surface border border-brand-border rounded-2xl p-3 flex items-center gap-3 shadow-sm"
            >
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                  line.pack_type === 'carton'
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'bg-brand-bg text-brand-muted'
                }`}
              >
                {line.pack_type === 'carton' ? <Box size={17} /> : <PackageOpen size={17} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-ink truncate">{line.sku_name}</p>
                <p className="text-[11px] text-brand-muted">
                  {line.pack_type === 'carton'
                    ? `${fmtQty(line.packs)} × ${fmtQty(line.units_per_pack)} = ${fmtQty(line.qty_units)}`
                    : `${fmtQty(line.qty_units)} units`}
                  {line.batch_no && ` · batch ${line.batch_no}`}
                  {line.gst_rate > 0 && ` · ${fmtQty(line.gst_rate)}% GST`}
                </p>
              </div>
              <p className="text-sm font-bold text-brand-ink shrink-0">{money(line.line_total)}</p>
              <button
                onClick={() => undoLine(line)}
                aria-label={`Undo ${line.sku_name}`}
                className="w-8 h-8 shrink-0 rounded-lg bg-brand-bg border border-brand-border text-brand-muted hover:text-brand-danger flex items-center justify-center focus-visible:ring-2 focus-visible:ring-brand-danger outline-none"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {session && <SupplierDetails session={session} onSaved={setSession} />}

      {lines.length > 0 && (
        <button
          onClick={finish}
          disabled={closing}
          className="w-full py-3.5 rounded-2xl bg-brand-primary text-brand-on-primary font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
        >
          {closing ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
          {t('scan.finish')}
        </button>
      )}

      {sheet && (
        <IntakeItemSheet
          suggestion={sheet.suggestion}
          barcode={sheet.barcode}
          found={sheet.found}
          details={sheet.details}
          onClose={() => {
            setSheet(null);
            clearRepeatGuard();
          }}
          onAdded={async () => {
            setSheet(null);
            clearRepeatGuard();
            await refresh();
          }}
        />
      )}
    </div>
  );
}

/** Shape an inventory row like the backend's carton suggestion payload. */
function suggestionFor(item) {
  return {
    item_id: item.id,
    sku_name: item.sku_name,
    packs: 1,
    units_per_pack: item.pack_type === 'carton' ? item.units_per_pack || 1 : 1,
    unit_cost: item.cost_price || 0,
    unit_price: item.selling_price || 0,
    gst_rate: item.gst_rate || 0,
    hsn_code: item.hsn_code,
    mfg_date: item.mfg_date,
    expiry_date: item.expiry_date,
  };
}

function Header({ title, subtitle, className = '' }) {
  return (
    <div className={`pt-1 ${className}`}>
      <h2 className="text-xl font-bold text-brand-ink font-inter">{title}</h2>
      <p className="text-sm text-brand-muted mt-0.5">{subtitle}</p>
    </div>
  );
}

/** Plenty of kirana stock has no barcode at all -- loose dal, local brands. */
function NoBarcodePicker({ onPick }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const query = term.trim();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/inventory', { params: { search: query || undefined, limit: 8 } });
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term, open]);

  return (
    <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-brand-ink"
      >
        <span className="flex items-center gap-2">
          <Search size={15} className="text-brand-muted" /> {t('scan.no_barcode')}
        </span>
        <ChevronDown size={16} className={`text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('scan.search_products')}
            aria-label="Search products"
            className="w-full bg-brand-bg border border-brand-border rounded-2xl px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          {searching && <p className="text-xs text-brand-muted px-1">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="text-xs text-brand-muted px-1">Nothing matched.</p>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onPick(item);
                setOpen(false);
                setTerm('');
              }}
              className="w-full text-left bg-brand-bg border border-brand-border rounded-2xl px-3 py-2 flex items-center justify-between gap-2 hover:border-brand-primary transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-brand-ink truncate">{item.sku_name}</span>
                <span className="block text-[11px] text-brand-muted">
                  {fmtQty(item.current_qty)} {item.unit} in stock
                  {item.pack_type === 'carton' && ` · box of ${fmtQty(item.units_per_pack)}`}
                </span>
              </span>
              <Check size={15} className="text-brand-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Supplier and invoice details -- what turns the printout into a tax record. */
function SupplierDetails({ session, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_name: session.supplier_name || '',
    supplier_gstin: session.supplier_gstin || '',
    invoice_no: session.invoice_no || '',
    invoice_date: session.invoice_date ? session.invoice_date.slice(0, 10) : '',
    note: session.note || '',
  });

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put(`/intake/session/${session.id}`, {
        ...form,
        invoice_date: form.invoice_date ? new Date(form.invoice_date).toISOString() : null,
      });
      onSaved(data);
      setOpen(false);
      toast.success('Invoice details saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const filled = form.supplier_name || form.invoice_no;
  const field =
    'w-full bg-brand-bg border border-brand-border rounded-2xl px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary';

  return (
    <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-brand-ink"
      >
        <span className="flex items-center gap-2">
          <FileText size={15} className="text-brand-muted" />
          {filled ? form.supplier_name || form.invoice_no : 'Supplier and invoice details'}
        </span>
        <ChevronDown size={16} className={`text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <form onSubmit={save} className="px-3 pb-3 space-y-2">
          <input value={form.supplier_name} onChange={set('supplier_name')} placeholder="Supplier name" aria-label="Supplier name" className={field} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.supplier_gstin} onChange={set('supplier_gstin')} placeholder="Supplier GSTIN" aria-label="Supplier GSTIN" className={`${field} font-mono uppercase`} />
            <input value={form.invoice_no} onChange={set('invoice_no')} placeholder="Invoice no." aria-label="Invoice number" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.invoice_date} onChange={set('invoice_date')} aria-label="Invoice date" className={field} />
            <input value={form.note} onChange={set('note')} placeholder="Note" aria-label="Note" className={field} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-2xl bg-brand-primary text-brand-on-primary text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={15} className="animate-spin" />} Save details
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Audible feedback, because a shopkeeper scanning a crate is looking at the
 * crate and not at the screen. A miss used to be silent, so the only way to
 * notice one was to look up -- which defeats the point of scanning by feel.
 *
 * One shared AudioContext, unlocked by a tap. iOS refuses to start audio that
 * was not begun inside a user gesture, and a scan arrives from the camera loop
 * rather than a tap -- so a context created at that moment stays suspended and
 * every iPhone would be silent. `unlockAudio` is called from the button that
 * starts the camera, which is a gesture.
 */
let audioCtx = null;

function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function tone(kind = 'ok') {
  try {
    // Android and most desktops; iOS has no vibration API at all.
    navigator.vibrate?.(kind === 'ok' ? 40 : [60, 40, 60]);
    if (!audioCtx || audioCtx.state !== 'running') return;

    const beeps = kind === 'ok' ? [[880, 0]] : [[300, 0], [240, 0.16]];
    beeps.forEach(([frequency, offset]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const at = audioCtx.currentTime + offset;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.13);
    });
  } catch {
    // Audio is a nicety; never let it break a scan.
  }
}
