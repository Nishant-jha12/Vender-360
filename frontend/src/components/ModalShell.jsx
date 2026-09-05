import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Shared form primitives. These started out local to Inventory.jsx; the scan
 *  screen needs the same sheet, and two copies would drift. */

export const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary';

export function Field({ label, children, required, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
        {label}{required && <span className="text-brand-danger"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-[10px] text-brand-muted mt-1">{hint}</span>}
    </label>
  );
}

export default function ModalShell({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="bg-brand-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 shadow-2xl border border-brand-border max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-brand-ink">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-brand-muted hover:text-brand-ink p-1 rounded-full hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
