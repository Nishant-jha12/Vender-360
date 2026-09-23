import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Check, Copy, Loader2, QrCode, Smartphone, X, Volume2,
  Sparkles, Radio, CheckCircle2, ArrowRight, Zap, RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Link } from 'react-router-dom';
import { api, errorMessage, API_BASE_URL, readStoredAuth } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useSoundbox } from '../context/SoundboxContext';
import { useToast } from './Toast';
import { useTranslation } from 'react-i18next';

/**
 * UPI QR & Auto-Reconciled Soundbox Checkout Modal
 *
 * Features:
 * 1. Dynamic BharatQR generation with unique transaction reference (txn_ref).
 * 2. Real-time auto-reconciliation via Server-Sent Events (SSE) with polling fallback.
 * 3. In-app vernacular Soundbox audio playback with electronic chime & TTS.
 * 4. 1-Tap Customer Payment Simulator for effortless testing & live demos.
 * 5. Instant Bank UTR confirmation and receipt finalization.
 */
export default function CheckoutModal({
  isOpen,
  onClose,
  initialAmount = 0,
  lockAmount = false,
  customerName = '',
  onPaymentSuccess,
}) {
  const { vendor } = useAuth();
  const { announce, enabled: soundboxEnabled, lang: soundboxLang } = useSoundbox();
  const toast = useToast();
  const { t } = useTranslation();

  const [amount, setAmount] = useState(initialAmount || 0);
  const [intent, setIntent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [reconciledPayment, setReconciledPayment] = useState(null);
  const [copiedUtr, setCopiedUtr] = useState(false);

  const intentRef = useRef(null);
  const sseRef = useRef(null);
  const pollTimerRef = useRef(null);
  const autoFinishTimerRef = useRef(null);

  // Keep intentRef synchronized for closures/intervals
  useEffect(() => {
    intentRef.current = intent;
  }, [intent]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setAmount(initialAmount || 0);
      setIntent(null);
      setError(null);
      setReconciledPayment(null);
      setSimulating(false);
    } else {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (autoFinishTimerRef.current) {
        clearTimeout(autoFinishTimerRef.current);
        autoFinishTimerRef.current = null;
      }
    }
  }, [isOpen, initialAmount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (autoFinishTimerRef.current) clearTimeout(autoFinishTimerRef.current);
    };
  }, []);

  const handlePaymentCompleted = useCallback((paymentData) => {
    // Avoid double triggering if already reconciled
    if (reconciledPayment) return;
    setReconciledPayment(paymentData);

    // 1. Confetti burst
    try {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
      });
    } catch {
      // Confetti is decorative
    }

    // 2. Play Soundbox chime & voice announcement
    announce({
      amount: paymentData.amount,
      payerName: paymentData.payer_name,
      txnRef: paymentData.txn_ref,
    });
  }, [announce, reconciledPayment]);

  // Fetch or recreate payment intent when amount changes
  const createPaymentIntent = useCallback(async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/checkout/create-intent', {
        amount: value,
        note: customerName ? `Khata: ${customerName}` : 'Store purchase',
      });
      setIntent(res.data);
    } catch (err) {
      if (err?.response?.status !== 401) {
        setError(errorMessage(err, t('billing.qr_gen_failed', 'Could not generate dynamic QR code')));
      }
    } finally {
      setLoading(false);
    }
  }, [amount, customerName, t]);

  // Debounced QR generation
  useEffect(() => {
    if (!isOpen || reconciledPayment) return undefined;
    const timer = setTimeout(createPaymentIntent, 350);
    return () => clearTimeout(timer);
  }, [isOpen, createPaymentIntent, reconciledPayment]);

  // Setup SSE stream and fallback polling whenever an intent is active
  useEffect(() => {
    if (!isOpen || !intent?.txn_ref || reconciledPayment) return;

    const currentTxnRef = intent.txn_ref;

    // Connect Server-Sent Events (SSE)
    try {
      const auth = readStoredAuth();
      const token = auth?.token || '';
      const sseUrl = `${API_BASE_URL}/checkout/stream?token=${encodeURIComponent(token)}`;

      const es = new EventSource(sseUrl);
      sseRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.event === 'payment_completed' &&
            data.txn_ref === currentTxnRef &&
            data.status === 'completed'
          ) {
            handlePaymentCompleted(data);
          }
        } catch {
          // ignore non-json keepalives
        }
      };

      es.onerror = () => {
        // SSE closed or errored, fallback polling will take over
        if (es.readyState === EventSource.CLOSED) {
          es.close();
        }
      };
    } catch (e) {
      console.warn('[CheckoutModal] EventSource setup failed, relying on polling:', e);
    }

    // Fallback polling every 2.5 seconds
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/checkout/intent/${currentTxnRef}/status`);
        if (res.data?.status === 'completed') {
          handlePaymentCompleted(res.data);
        }
      } catch {
        // network hiccup
      }
    }, 2500);

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, intent?.txn_ref, reconciledPayment, handlePaymentCompleted]);

  // Handle manual or automated finish
  const handleFinalize = useCallback(() => {
    const finalAmount = reconciledPayment?.amount || parseFloat(amount) || 0;
    onPaymentSuccess?.(finalAmount, reconciledPayment);
    onClose();
  }, [reconciledPayment, amount, onPaymentSuccess, onClose]);

  // Simulate customer payment (1-Tap Demo)
  const handleSimulatePayment = async () => {
    if (!intent?.txn_ref || simulating) return;
    setSimulating(true);
    try {
      const res = await api.post('/checkout/simulate-payment', {
        txn_ref: intent.txn_ref,
        payer_name: 'Rahul Sharma',
        payer_vpa: 'rahul@oksbi',
      });
      toast.success(t('soundbox.simulated_success', 'Demo payment simulated successfully!'));
      handlePaymentCompleted(res.data);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to simulate payment'));
    } finally {
      setSimulating(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount) || 0;
  const missingUpi = !vendor?.upi_id;

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(vendor.upi_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Long-press the ID to copy it manually.');
    }
  };

  const copyUtr = async (utr) => {
    if (!utr) return;
    try {
      await navigator.clipboard.writeText(utr);
      setCopiedUtr(true);
      setTimeout(() => setCopiedUtr(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm transition-all"
      role="dialog"
      aria-modal="true"
      aria-label="UPI Checkout & Soundbox"
      onClick={onClose}
    >
      <div
        className="bg-brand-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 shadow-2xl border border-brand-border relative max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-brand-muted hover:text-brand-ink p-1 rounded-full hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary outline-none transition-colors"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-2 border border-brand-primary/20 shadow-sm">
            {reconciledPayment ? (
              <CheckCircle2 size={28} className="text-brand-emerald" />
            ) : (
              <QrCode size={26} />
            )}
          </div>
          <h3 className="font-extrabold text-xl text-brand-ink font-inter">
            {reconciledPayment
              ? t('soundbox.payment_verified', 'Payment Reconciled!')
              : t('billing.checkout_title', 'Dynamic UPI Checkout')}
          </h3>
          <p className="text-xs text-brand-muted mt-0.5">
            {reconciledPayment
              ? t('soundbox.verified_desc', 'Soundbox verified the payment on NPCI UPI network')
              : t('billing.checkout_subtitle', 'Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)')}
          </p>
        </div>

        {missingUpi ? (
          <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-brand-ink">{t('billing.missing_upi_title', 'Add your UPI ID first')}</p>
            <p className="text-xs text-brand-muted mt-1.5 leading-relaxed">
              {t('billing.missing_upi_desc', 'Payments must go to your own account, so Vendor360 needs the UPI ID customers should pay.')}
            </p>
            <Link
              to="/app/account"
              onClick={onClose}
              className="inline-block mt-4 bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl shadow-sm hover:opacity-90"
            >
              {t('billing.open_account_settings', 'Open Account Settings')}
            </Link>
          </div>
        ) : reconciledPayment ? (
          /* Reconciled Celebration State */
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-brand-emerald/10 border border-brand-emerald/30 rounded-2xl p-5 text-center my-3">
              <div className="w-14 h-14 bg-brand-emerald/20 text-brand-emerald rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={32} strokeWidth={3} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-emerald">
                {t('soundbox.received_badge', 'Instant UPI Credit')}
              </p>
              <h4 className="text-3xl font-black text-brand-ink font-inter mt-1">
                {money(reconciledPayment.amount)}
              </h4>
              <p className="text-xs text-brand-muted mt-1">
                {t('soundbox.payer', 'Received from')}: <span className="font-bold text-brand-ink">{reconciledPayment.payer_name || 'Customer'}</span>
              </p>
            </div>

            {/* Reconciliation Details Card */}
            <div className="bg-brand-bg rounded-2xl p-4 border border-brand-border space-y-2.5 text-xs mb-5">
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">{t('soundbox.bank_utr', 'Bank UTR / Ref No')}:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-brand-ink">{reconciledPayment.bank_ref_num || 'N/A'}</span>
                  {reconciledPayment.bank_ref_num && (
                    <button
                      onClick={() => copyUtr(reconciledPayment.bank_ref_num)}
                      className="text-brand-primary p-0.5 rounded hover:bg-brand-surface"
                      title="Copy UTR"
                    >
                      {copiedUtr ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-brand-muted">{t('soundbox.txn_ref', 'Transaction ID')}:</span>
                <span className="font-mono text-brand-ink text-[11px] truncate max-w-[180px]">
                  {reconciledPayment.txn_ref}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-brand-muted">{t('soundbox.customer_vpa', 'Payer VPA')}:</span>
                <span className="font-mono text-brand-ink">{reconciledPayment.payer_vpa || 'upi@bank'}</span>
              </div>

              <div className="flex items-center justify-between border-t border-brand-border/60 pt-2">
                <div className="flex items-center gap-1.5 text-brand-emerald font-semibold">
                  <Volume2 size={14} />
                  <span>{t('soundbox.audio_announced', 'Voice announcement played')}</span>
                </div>
                <span className="text-[10px] bg-brand-emerald/15 text-brand-emerald px-2 py-0.5 rounded-full font-bold uppercase">
                  {soundboxLang}
                </span>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleFinalize}
              className="w-full py-3.5 rounded-2xl bg-brand-emerald text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 hover:bg-brand-emerald/90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-brand-emerald outline-none"
            >
              <span>{t('billing.finalize_bill', 'Complete & Finalize Sale')}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          /* Active Payment Waiting State */
          <>
            <div className="bg-brand-bg rounded-2xl p-3.5 border border-brand-border mb-3.5">
              <label
                htmlFor="upi-amount"
                className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block text-center"
              >
                {t('billing.amount_to_collect', 'Amount to collect')}
              </label>
              {lockAmount ? (
                <p className="text-center text-3xl font-black text-brand-ink font-inter mt-1">
                  {money(numericAmount)}
                </p>
              ) : (
                <>
                  <div className="relative mt-1 max-w-[200px] mx-auto">
                    <span className="absolute left-3 top-2.5 text-xl font-extrabold text-brand-primary">₹</span>
                    <input
                      id="upi-amount"
                      type="number"
                      step="any"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-brand-surface border border-brand-border rounded-2xl pl-9 pr-3 py-1.5 text-center text-2xl font-extrabold text-brand-ink font-inter focus:ring-2 focus:ring-brand-primary outline-none"
                    />
                  </div>
                  <div className="flex justify-center flex-wrap gap-1.5 mt-2">
                    {[50, 100, 250, 500, 1000].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAmount(value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${
                          numericAmount === value
                            ? 'bg-brand-primary text-brand-on-primary border-brand-primary'
                            : 'bg-brand-surface text-brand-ink border-brand-border hover:border-brand-primary/50'
                        }`}
                      >
                        ₹{value}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-3.5 bg-brand-surface rounded-2xl border border-brand-border mb-3 min-h-[230px] relative overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-brand-muted py-14">
                  <Loader2 className="animate-spin text-brand-primary" size={32} />
                  <p className="text-xs font-semibold">{t('billing.generating_qr', 'Generating dynamic QR...')}</p>
                </div>
              ) : error ? (
                <div className="text-center py-10 px-4">
                  <p className="text-xs text-brand-danger font-semibold">{error}</p>
                  <button
                    onClick={createPaymentIntent}
                    className="mt-3 text-xs font-bold text-brand-primary hover:underline"
                  >
                    {t('common.try_again', 'Try again')}
                  </button>
                </div>
              ) : intent?.qr_base64 ? (
                <div className="flex flex-col items-center">
                  <div className="relative p-2 bg-white rounded-2xl border-2 border-brand-primary/30 shadow-md group">
                    <img
                      src={intent.qr_base64}
                      alt={`Dynamic UPI QR code for ${money(numericAmount)}`}
                      className="w-48 h-48 object-contain"
                    />
                    {/* Subtle Corner Markers */}
                    <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-brand-primary" />
                    <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-brand-primary" />
                    <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-brand-primary" />
                    <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-brand-primary" />
                  </div>

                  {/* Dynamic Reference Tag */}
                  {intent.txn_ref && (
                    <div className="mt-2 text-[11px] font-mono text-brand-muted flex items-center gap-1 bg-brand-bg px-2.5 py-0.5 rounded-full border border-brand-border">
                      <span>Ref:</span>
                      <span className="font-bold text-brand-ink">{intent.txn_ref}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-brand-muted py-14">
                  {t('billing.enter_amount_hint', 'Enter an amount to generate a QR.')}
                </p>
              )}

              {/* UPI ID Badge */}
              <div className="flex items-center gap-2 mt-2 bg-brand-bg px-3 py-1 rounded-full border border-brand-border text-xs">
                <span className="font-semibold text-brand-muted">UPI:</span>
                <span className="font-mono font-bold text-brand-ink">{vendor.upi_id}</span>
                <button
                  onClick={copyUpiId}
                  aria-label="Copy UPI ID"
                  className="text-brand-primary p-0.5 rounded hover:bg-brand-surface focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {/* Listening Indicator (Radar Pulse) */}
            <div className="flex items-center justify-between px-3 py-2 bg-brand-primary/5 rounded-xl border border-brand-primary/20 mb-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary"></span>
                </span>
                <span className="font-medium text-brand-ink">
                  {t('soundbox.listening', 'Soundbox waiting for payment...')}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-brand-primary font-bold">
                <Volume2 size={13} />
                <span>{soundboxEnabled ? t('soundbox.active', 'Active') : t('soundbox.muted', 'Muted')}</span>
              </div>
            </div>

            {/* Action Buttons & Simulation */}
            <div className="space-y-2">
              {/* ⚡ 1-Tap Demo Simulation Button */}
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={!intent?.txn_ref || simulating}
                className="w-full py-2.5 rounded-xl border border-brand-primary/40 bg-brand-primary/10 text-brand-primary font-bold text-xs flex items-center justify-center gap-2 hover:bg-brand-primary/20 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {simulating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{t('soundbox.simulating', 'Simulating customer UPI transfer...')}</span>
                  </>
                ) : (
                  <>
                    <Zap size={15} className="text-brand-primary fill-brand-primary" />
                    <span>{t('soundbox.simulate_button', '⚡ Simulate Customer Payment (1-Tap Demo)')}</span>
                  </>
                )}
              </button>

              {intent?.upi_url && (
                <a
                  href={intent.upi_url}
                  className="w-full py-2 rounded-xl border border-brand-border bg-brand-surface text-brand-ink font-semibold text-xs flex items-center justify-center gap-2 hover:bg-brand-bg transition-colors"
                >
                  <Smartphone size={15} />
                  <span>{t('billing.open_upi_app', 'Open in a UPI app')}</span>
                </a>
              )}

              {/* Manual Confirmation Fallback */}
              <button
                onClick={() => handleFinalize()}
                disabled={!intent || numericAmount <= 0}
                className="w-full py-3 rounded-2xl bg-brand-primary text-brand-on-primary font-extrabold text-sm shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
              >
                <Check size={18} strokeWidth={3} />
                <span>{t('billing.confirm_manual', 'Payment received — record it')}</span>
              </button>

              <p className="text-[10px] text-brand-muted text-center leading-relaxed">
                {t('soundbox.footer_hint', 'Soundbox will automatically verify and announce payments in real-time.')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
