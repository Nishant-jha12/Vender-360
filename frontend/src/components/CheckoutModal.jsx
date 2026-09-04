import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, QrCode, Smartphone, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

/**
 * UPI QR for a counter payment.
 *
 * The QR is generated against the signed-in vendor's own UPI ID. It used to be
 * hardcoded to a single VPA, so every store's QR collected money into the same
 * account.
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
  const toast = useToast();

  const [amount, setAmount] = useState(initialAmount || 0);
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount(initialAmount || 0);
      setQrData(null);
      setError(null);
    }
  }, [isOpen, initialAmount]);

  const fetchQr = useCallback(async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/checkout/generate-upi-qr', {
        params: {
          amount: value,
          note: customerName ? `Khata payment: ${customerName}` : 'Store purchase',
        },
      });
      setQrData(res.data);
    } catch (err) {
      if (err?.response?.status !== 401) setError(errorMessage(err, 'Could not generate the QR code'));
    } finally {
      setLoading(false);
    }
  }, [amount, customerName]);

  // Debounced so typing an amount doesn't fire a request per keystroke.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(fetchQr, 350);
    return () => clearTimeout(timer);
  }, [isOpen, fetchQr]);

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

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="UPI checkout"
      onClick={onClose}
    >
      <div
        className="bg-brand-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 shadow-2xl border border-brand-border relative max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-brand-muted hover:text-brand-ink p-1 rounded-full hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-5">
          <div className="w-11 h-11 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-2 border border-brand-border">
            <QrCode size={24} />
          </div>
          <h3 className="font-extrabold text-xl text-brand-ink font-inter">UPI Checkout</h3>
          <p className="text-xs text-brand-muted mt-0.5">
            Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
          </p>
        </div>

        {missingUpi ? (
          <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-brand-ink">Add your UPI ID first</p>
            <p className="text-xs text-brand-muted mt-1.5 leading-relaxed">
              Payments must go to your own account, so Vendor360 needs the UPI ID
              customers should pay.
            </p>
            <Link
              to="/app/account"
              onClick={onClose}
              className="inline-block mt-4 bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl"
            >
              Open Account settings
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-brand-bg rounded-2xl p-4 border border-brand-border mb-4">
              <label
                htmlFor="upi-amount"
                className="text-[11px] font-bold text-brand-muted uppercase tracking-wider block text-center"
              >
                Amount to collect
              </label>
              {lockAmount ? (
                <p className="text-center text-3xl font-extrabold text-brand-ink font-inter mt-1.5">
                  {money(numericAmount)}
                </p>
              ) : (
                <>
                  <div className="relative mt-1.5 max-w-[220px] mx-auto">
                    <span className="absolute left-3 top-2.5 text-xl font-extrabold text-brand-primary">₹</span>
                    <input
                      id="upi-amount"
                      type="number"
                      step="any"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-brand-surface border border-brand-border rounded-2xl pl-9 pr-3 py-2 text-center text-2xl font-extrabold text-brand-ink font-inter focus:ring-2 focus:ring-brand-primary outline-none"
                    />
                  </div>
                  <div className="flex justify-center flex-wrap gap-2 mt-3">
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

            <div className="flex flex-col items-center justify-center p-4 bg-brand-surface rounded-2xl border border-brand-border mb-4 min-h-[240px]">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-brand-muted py-16">
                  <Loader2 className="animate-spin text-brand-primary" size={30} />
                  <p className="text-xs font-semibold">Generating QR...</p>
                </div>
              ) : error ? (
                <div className="text-center py-12 px-4">
                  <p className="text-xs text-brand-danger font-semibold">{error}</p>
                  <button
                    onClick={fetchQr}
                    className="mt-3 text-xs font-bold text-brand-primary hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : qrData?.qr_base64 ? (
                <img
                  src={qrData.qr_base64}
                  alt={`UPI QR code for ${money(numericAmount)}`}
                  className="w-52 h-52 object-contain rounded-2xl border-2 border-brand-primary/25 p-2 bg-white"
                />
              ) : (
                <p className="text-xs text-brand-muted py-16">Enter an amount to generate a QR.</p>
              )}

              <div className="flex items-center gap-2 mt-3 bg-brand-bg px-3 py-1.5 rounded-full border border-brand-border text-xs">
                <span className="font-semibold text-brand-muted">UPI ID:</span>
                <span className="font-mono font-bold text-brand-ink">{vendor.upi_id}</span>
                <button
                  onClick={copyUpiId}
                  aria-label="Copy UPI ID"
                  className="text-brand-primary p-0.5 rounded focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {qrData?.upi_url && (
                <a
                  href={qrData.upi_url}
                  className="w-full py-2.5 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 text-brand-primary font-bold text-xs flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-colors"
                >
                  <Smartphone size={16} />
                  Open in a UPI app
                </a>
              )}
              <button
                onClick={() => onPaymentSuccess?.(numericAmount)}
                disabled={!qrData || numericAmount <= 0}
                className="w-full py-3.5 rounded-2xl bg-brand-primary text-brand-on-primary font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
              >
                <Check size={18} strokeWidth={3} />
                Payment received — record it
              </button>
              <p className="text-[10px] text-brand-muted text-center leading-relaxed pt-1">
                Vendor360 cannot see your bank account, so confirm the payment
                landed in your UPI app before tapping this.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
