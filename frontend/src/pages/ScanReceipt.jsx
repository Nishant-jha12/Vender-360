import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Loader2, Plus, Trash2, VideoOff, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../components/Toast';
import { DemoNotice } from '../components/States';

const BLANK_LINE = { sku_name: '', qty: 1, cost_price: 0 };

/**
 * Capture a wholesale bill and add its items to stock.
 *
 * OCR is not wired up: the extraction step is a placeholder, and it says so
 * rather than presenting invented line items as if they had been read from the
 * photo. The manual entry path below it is real and writes to inventory.
 */
export default function ScanReceipt() {
  const [stage, setStage] = useState('capture'); // capture | review | saving
  const [lines, setLines] = useState([{ ...BLANK_LINE }]);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (stage !== 'capture') {
      stopCamera();
      return undefined;
    }

    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError('');
      })
      .catch(() => setCameraError('Camera unavailable or permission denied.'));

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stage]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const save = async () => {
    const valid = lines.filter((line) => line.sku_name.trim() && Number(line.qty) > 0);
    if (!valid.length) {
      toast.error('Add at least one item with a quantity');
      return;
    }
    setStage('saving');
    try {
      const res = await api.post('/inventory/ocr-entry', {
        items: valid.map((line) => ({
          sku_name: line.sku_name.trim(),
          qty: Number(line.qty),
          cost_price: Number(line.cost_price) || null,
        })),
      });
      toast.success(res.data.message);
      navigate('/app/stock');
    } catch (err) {
      toast.error(errorMessage(err));
      setStage('review');
    }
  };

  const setLine = (index, field, value) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)));

  return (
    <div className="max-w-md mx-auto pt-2 pb-24 px-1">
      <div className="text-center mb-5">
        <h2 className="text-xl font-bold text-brand-ink font-inter">Add from a bill</h2>
        <p className="text-sm text-brand-muted mt-1">Restock from a wholesale invoice</p>
      </div>

      {stage === 'capture' && (
        <div className="space-y-5">
          <DemoNotice>
            Automatic text extraction is not connected yet, so the photo is a
            reference for you rather than something the app reads. Type the
            lines below and they will be added to your stock for real.
          </DemoNotice>

          <div className="w-full h-64 bg-black rounded-2xl flex items-center justify-center relative overflow-hidden">
            {cameraError ? (
              <div className="flex flex-col items-center text-white/80 px-6 text-center">
                <VideoOff size={40} className="mb-3 opacity-70" />
                <p className="text-sm font-semibold">{cameraError}</p>
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none" />
              </>
            )}
          </div>

          <button
            onClick={() => setStage('review')}
            className="w-full bg-brand-primary text-brand-on-primary font-bold py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
          >
            <Camera size={18} /> Enter the items
          </button>
        </div>
      )}

      {(stage === 'review' || stage === 'saving') && (
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="bg-brand-surface border border-brand-border rounded-2xl p-3 space-y-2 shadow-sm">
              <div className="flex gap-2">
                <input
                  value={line.sku_name}
                  onChange={(e) => setLine(index, 'sku_name', e.target.value)}
                  placeholder="Item name"
                  aria-label={`Item ${index + 1} name`}
                  className="flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                {lines.length > 1 && (
                  <button
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove item ${index + 1}`}
                    className="w-9 h-9 shrink-0 rounded-lg bg-brand-bg border border-brand-border text-brand-muted hover:text-brand-danger flex items-center justify-center"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-brand-muted uppercase">Quantity</span>
                  <input type="number" step="any" min="0" value={line.qty} onChange={(e) => setLine(index, 'qty', e.target.value)} className="w-full mt-0.5 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-bold text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-brand-muted uppercase">Cost each (₹)</span>
                  <input type="number" step="0.01" min="0" value={line.cost_price} onChange={(e) => setLine(index, 'cost_price', e.target.value)} className="w-full mt-0.5 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-bold text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                </label>
              </div>
            </div>
          ))}

          <button
            onClick={() => setLines((current) => [...current, { ...BLANK_LINE }])}
            className="w-full text-xs font-bold bg-brand-bg border border-dashed border-brand-border py-2.5 rounded-2xl text-brand-ink flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Add another line
          </button>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStage('capture')} className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-ink font-semibold bg-brand-surface flex items-center justify-center gap-2 text-sm">
              <X size={17} /> Back
            </button>
            <button onClick={save} disabled={stage === 'saving'} className="flex-1 py-3 rounded-2xl bg-brand-primary text-brand-on-primary font-semibold flex items-center justify-center gap-2 text-sm disabled:opacity-60">
              {stage === 'saving' ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
              Add to stock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
