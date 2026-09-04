import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/**
 * A small toast system with no third-party dependency.
 *
 * Replaces the twelve window.alert() calls the app used for every success and
 * failure -- alert() blocks the page, looks like a browser error, and can't be
 * styled or stacked.
 */
const ToastContext = createContext(null);

const VARIANTS = {
  success: { icon: CheckCircle2, ring: 'border-brand-success/40', accent: 'text-brand-success' },
  error: { icon: XCircle, ring: 'border-brand-danger/40', accent: 'text-brand-danger' },
  warning: { icon: AlertTriangle, ring: 'border-brand-amber/50', accent: 'text-brand-amber' },
  info: { icon: Info, ring: 'border-brand-primary/40', accent: 'text-brand-primary' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, variant = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-3), { id, message, variant, duration }]);
    return id;
  }, []);

  const toast = useMemo(
    () => ({
      success: (m, d) => push(m, 'success', d),
      error: (m, d) => push(m, 'error', d ?? 6000),
      warning: (m, d) => push(m, 'warning', d ?? 6000),
      info: (m, d) => push(m, 'info', d),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="fixed z-[100] bottom-24 md:bottom-6 right-3 left-3 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const variant = VARIANTS[toast.variant] || VARIANTS.info;
  const Icon = variant.icon;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      // Errors interrupt; everything else waits its turn in the screen-reader queue.
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto bg-brand-surface border ${variant.ring} rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200`}
    >
      <Icon size={18} className={`${variant.accent} shrink-0 mt-0.5`} />
      <p className="text-sm text-brand-ink flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-brand-muted hover:text-brand-ink shrink-0 rounded p-0.5 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
