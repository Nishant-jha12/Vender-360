import { useState, useRef, useEffect } from 'react';
import { Camera, Check, X, Loader2, Scan, VideoOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function ScanReceipt() {
  const [status, setStatus] = useState('idle'); // idle, scanning, review, saving
  const [items, setItems] = useState([]);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setCameraError('');
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Camera permission denied or device unavailable.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  useEffect(() => {
    // Start camera when component mounts and status is idle
    if (status === 'idle') {
      startCamera();
    } else {
      stopCamera();
    }

    // Cleanup camera when component unmounts
    return () => {
      stopCamera();
    };
  }, [status]);

  const handleScan = () => {
    // In a real implementation, we would draw the video frame to a canvas and send the image blob to the backend.
    setStatus('scanning');
    stopCamera();
    
    // Simulate OCR processing time
    setTimeout(() => {
      setItems([
        { id: 1, sku_name: 'Amul Milk 500ml', qty: 20 },
        { id: 2, sku_name: 'Britannia Bread', qty: 15 },
        { id: 3, sku_name: 'Sunflower Oil 1L', qty: 5 },
      ]);
      setStatus('review');
    }, 2000);
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      await axios.post('http://127.0.0.1:8000/api/inventory/ocr-entry', {
        vendor_id: authData?.vendor_id,
        items: items
      });
      alert('Receipt processed and inventory updated successfully!');
      navigate('/app/stock');
    } catch (err) {
      console.error(err);
      alert('Error saving receipt');
      setStatus('review');
    }
  };

  return (
    <div className="flex flex-col items-center justify-start h-full pt-4 pb-20 px-4">
      
      <div className="w-full mb-6 text-center">
        <h2 className="text-xl font-bold text-brand-ink">Scan Receipt</h2>
        <p className="text-sm text-brand-muted mt-1">Auto-extract items from wholesale bills</p>
      </div>

      {status === 'idle' && (
        <div className="w-full flex flex-col items-center">
          <div className="w-full h-80 bg-black rounded-2xl flex items-center justify-center relative shadow-inner overflow-hidden mb-8 transition-colors">
            
            {cameraError ? (
              <div className="flex flex-col items-center text-brand-danger z-10 px-6 text-center">
                <VideoOff size={48} className="mb-3 opacity-80" />
                <p className="text-sm font-semibold">{cameraError}</p>
                <p className="text-xs mt-2 text-white/60">Please allow camera access in your browser settings.</p>
              </div>
            ) : (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            
            {/* Viewfinder overlay */}
            {!cameraError && (
              <>
                <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-xl z-10 pointer-events-none shadow-[0_0_0_4000px_rgba(0,0,0,0.3)]"></div>
                <p className="absolute bottom-8 text-white text-sm z-10 font-medium px-4 py-1.5 bg-black/50 backdrop-blur-sm rounded-full">
                  Point camera at wholesale bill
                </p>
              </>
            )}
          </div>
          
          <button 
            onClick={handleScan}
            disabled={!!cameraError}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform border-4 border-brand-surface ring-2 ring-brand-teal ${
              cameraError 
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed border-brand-surface ring-gray-400' 
                : 'bg-brand-teal text-white active:scale-95'
            }`}
          >
            <Camera size={32} />
          </button>
        </div>
      )}

      {status === 'scanning' && (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="animate-spin text-brand-teal" size={48} />
          <p className="text-brand-ink font-semibold animate-pulse">Running OCR Engine...</p>
        </div>
      )}

      {status === 'review' && (
        <div className="w-full max-w-sm">
          <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border overflow-hidden mb-6 transition-colors">
            <div className="bg-brand-bg px-4 py-3 border-b border-brand-border">
              <h3 className="text-sm font-bold text-brand-ink">Detected Items</h3>
            </div>
            <div className="divide-y divide-brand-border">
              {items.map(item => (
                <div key={item.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-brand-ink">{item.sku_name}</p>
                    <p className="text-xs text-brand-muted">Qty: {item.qty}</p>
                  </div>
                  <Check size={20} className="text-brand-teal" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex space-x-3">
            <button 
              onClick={() => setStatus('idle')} 
              className="flex-1 py-3 px-4 rounded-xl border border-brand-border text-brand-ink font-semibold flex items-center justify-center space-x-2 bg-brand-surface active:opacity-80 shadow-sm transition-all"
            >
              <X size={18} />
              <span>Retake</span>
            </button>
            <button 
              onClick={handleSave} 
              className="flex-1 py-3 px-4 rounded-xl bg-brand-teal text-white font-semibold flex items-center justify-center space-x-2 active:bg-brand-teal-dark shadow-sm transition-colors"
            >
              <Check size={18} />
              <span>Confirm & Save</span>
            </button>
          </div>
        </div>
      )}
      
      {status === 'saving' && (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="animate-spin text-brand-teal" size={48} />
          <p className="text-brand-ink font-semibold">Updating Inventory...</p>
        </div>
      )}

    </div>
  );
}
