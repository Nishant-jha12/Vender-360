import { useState, useRef } from 'react';
import { Mic, Check, X, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function VoiceEntry() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('idle'); // idle, listening, confirming, processing, success
  const recognitionRef = useRef(null);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser does not support Speech Recognition.");
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-IN'; // Can be mapped to hi-IN based on user pref

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setStatus('listening');
      setTranscript('');
    };

    recognitionRef.current.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      setTranscript(finalTranscript);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      setStatus('confirming');
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleConfirm = async () => {
    setStatus('processing');
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      const res = await axios.post('http://127.0.0.1:8000/api/inventory/voice-entry', {
        vendor_id: authData?.vendor_id,
        transcript: transcript
      });
      alert(res.data.message);
      setStatus('idle');
      setTranscript('');
    } catch (err) {
      alert("Error processing request: " + (err.response?.data?.detail || err.message));
      setStatus('confirming');
    }
  };

  const handleCancel = () => {
    setStatus('idle');
    setTranscript('');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full pt-10 pb-20 px-4">
      <div className="text-center mb-10">
        <h2 className="text-xl font-bold text-brand-ink">Voice Logging</h2>
        <p className="text-sm text-brand-muted mt-2">
          {status === 'idle' && "Tap the microphone and speak naturally."}
          {status === 'listening' && "Listening... speak now."}
          {status === 'confirming' && "Did we get this right?"}
          {status === 'processing' && "Saving to inventory..."}
        </p>
      </div>

      {/* Pulsing Mic Button */}
      <div className="relative mb-12">
        {isListening && (
          <>
            <div className="absolute inset-0 bg-brand-amber/30 rounded-full animate-ping scale-150"></div>
            <div className="absolute inset-0 bg-brand-amber/20 rounded-full animate-pulse scale-125"></div>
          </>
        )}
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={status === 'processing' || status === 'confirming'}
          className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
            isListening ? 'bg-brand-amber text-white' : 'bg-brand-amber text-white'
          } ${(status === 'processing' || status === 'confirming') ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Mic size={40} />
        </button>
      </div>

      {/* Transcript Area */}
      <div className={`w-full max-w-sm bg-brand-surface p-5 rounded-xl border transition-all duration-300 ${transcript ? 'border-brand-amber shadow-md' : 'border-transparent bg-transparent'}`}>
        <p className="text-center text-brand-ink text-lg min-h-[3rem] italic">
          {transcript ? `"${transcript}"` : ""}
        </p>
        
        {status === 'confirming' && transcript && (
          <div className="flex space-x-3 mt-6">
            <button onClick={handleCancel} className="flex-1 py-3 px-4 rounded-xl border border-brand-border text-brand-ink font-semibold flex items-center justify-center space-x-2 bg-brand-bg active:opacity-80 transition-opacity">
              <X size={18} />
              <span>Cancel</span>
            </button>
            <button onClick={handleConfirm} className="flex-1 py-3 px-4 rounded-xl bg-brand-teal text-white font-semibold flex items-center justify-center space-x-2 active:bg-brand-teal-dark shadow-sm transition-colors">
              <Check size={18} />
              <span>Save</span>
            </button>
          </div>
        )}

        {status === 'processing' && (
          <div className="flex justify-center mt-6">
            <Loader2 className="animate-spin text-brand-teal" size={32} />
          </div>
        )}
      </div>

    </div>
  );
}
