import { useState, useEffect } from 'react';
import axios from 'axios';
import { QrCode, X, Check, Loader2, Copy, Smartphone, Sparkles, ShieldCheck } from 'lucide-react';

export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  initialAmount = 100, 
  customerName = '', 
  onPaymentSuccess 
}) {
  const [amount, setAmount] = useState(initialAmount || 100);
  const [storeUpi, setStoreUpi] = useState('vendor360@okaxis');
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  useEffect(() => {
    if (initialAmount) {
      setAmount(initialAmount);
    }
  }, [initialAmount]);

  useEffect(() => {
    if (isOpen && amount > 0) {
      fetchQrCode();
    }
  }, [isOpen, amount, storeUpi]);

  const fetchQrCode = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/checkout/generate-upi-qr`, {
        params: {
          amount: parseFloat(amount) || 1,
          store_upi_id: storeUpi,
          store_name: "Sharma General Store",
          note: customerName ? `Khata Payment: ${customerName}` : "Store Purchase"
        }
      });
      setQrData(res.data);
    } catch (err) {
      console.error("Failed to generate QR code:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUPI = () => {
    if (qrData?.upi_url) {
      navigator.clipboard.writeText(storeUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmPaid = () => {
    setPaymentDone(true);
    setTimeout(() => {
      setPaymentDone(false);
      if (onPaymentSuccess) {
        onPaymentSuccess(parseFloat(amount));
      }
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-brand-surface rounded-3xl w-full max-w-md p-6 shadow-2xl border border-brand-border relative animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute right-4 top-4 text-brand-muted hover:text-brand-ink p-1 rounded-full hover:bg-brand-bg transition-colors"
        >
          <X size={20} />
        </button>

        {paymentDone ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-brand-teal text-white flex items-center justify-center shadow-lg animate-bounce">
              <Check size={36} strokeWidth={3} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-brand-ink">Payment Received!</h3>
              <p className="text-sm text-brand-muted mt-1">₹{parseFloat(amount).toFixed(2)} received via UPI QR</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-4">
              <div className="w-11 h-11 rounded-2xl bg-brand-teal/10 text-brand-teal flex items-center justify-center mx-auto mb-2 border border-brand-teal/20 shadow-sm">
                <QrCode size={24} />
              </div>
              <h3 className="font-extrabold text-xl text-brand-ink font-poppins">Instant UPI QR Checkout</h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
              </p>
            </div>

            {/* Amount & Quick Selection */}
            <div className="bg-brand-bg rounded-2xl p-4 border border-brand-border mb-4">
              <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider block text-center">
                Billing Amount (₹)
              </label>
              <div className="relative mt-1 max-w-[200px] mx-auto">
                <span className="absolute left-3 top-2.5 text-xl font-extrabold text-brand-teal">₹</span>
                <input 
                  type="number"
                  step="any"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-xl pl-8 pr-3 py-2 text-center text-2xl font-black text-brand-ink font-poppins focus:ring-2 focus:ring-brand-teal outline-none shadow-inner"
                />
              </div>

              {/* Quick Chips */}
              <div className="flex justify-center space-x-2 mt-3">
                {[50, 100, 250, 500, 1000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      parseFloat(amount) === val 
                        ? 'bg-brand-teal text-white border-brand-teal shadow-sm' 
                        : 'bg-brand-surface text-brand-ink border-brand-border hover:border-brand-teal/50'
                    }`}
                  >
                    ₹{val}
                  </button>
                ))}
              </div>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-brand-surface rounded-2xl border border-brand-border shadow-inner relative mb-4">
              {loading ? (
                <div className="w-52 h-52 flex flex-col items-center justify-center space-y-2 text-brand-muted">
                  <Loader2 className="animate-spin text-brand-teal" size={32} />
                  <p className="text-xs font-semibold">Generating live UPI QR...</p>
                </div>
              ) : qrData?.qr_base64 ? (
                <div className="relative group">
                  <img 
                    src={qrData.qr_base64} 
                    alt="UPI Payment QR Code"
                    className="w-52 h-52 object-contain rounded-xl shadow-md border-2 border-brand-teal/30 p-2 bg-white"
                  />
                  <div className="absolute inset-0 border-2 border-brand-teal rounded-xl pointer-events-none opacity-40 animate-pulse" />
                </div>
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-brand-danger">
                  Failed to load QR code.
                </div>
              )}

              {/* UPI ID Badge with Copy */}
              <div className="flex items-center space-x-2 mt-3 bg-brand-bg px-3 py-1.5 rounded-full border border-brand-border text-xs">
                <span className="font-semibold text-brand-muted">UPI ID:</span>
                <span className="font-mono font-bold text-brand-ink">{storeUpi}</span>
                <button 
                  onClick={handleCopyUPI}
                  className="text-brand-teal hover:text-brand-teal-dark p-0.5"
                  title="Copy UPI ID"
                >
                  {copied ? <Check size={14} className="text-brand-teal" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Payment Actions */}
            <div className="space-y-2">
              {qrData?.upi_url && (
                <a
                  href={qrData.upi_url}
                  className="w-full py-2.5 rounded-xl border border-brand-teal/40 bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal font-bold text-xs flex items-center justify-center space-x-2 transition-all"
                >
                  <Smartphone size={16} />
                  <span>Open directly in UPI App</span>
                </a>
              )}

              <button
                onClick={handleConfirmPaid}
                className="w-full py-3.5 rounded-2xl bg-brand-teal text-white font-extrabold text-sm hover:bg-brand-teal-dark active:scale-[0.98] transition-all shadow-lg flex items-center justify-center space-x-2"
              >
                <Check size={18} strokeWidth={3} />
                <span>Mark Received ₹{parseFloat(amount || 0).toFixed(0)}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
