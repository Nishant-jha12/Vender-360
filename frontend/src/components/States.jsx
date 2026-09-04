import { AlertCircle, Info, RefreshCw } from 'lucide-react';

/** Grey blocks matching the shape of the content that's coming. */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-brand-border/60 rounded-lg ${className}`} />;
}

export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-brand-surface border border-brand-border rounded-2xl p-4 space-y-2.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-brand-surface border border-brand-border rounded-2xl p-4 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Shown when a request fails. The old pages logged to the console and left a
 * "Loading..." on screen forever, so a stopped backend looked like a hang.
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="bg-brand-danger/5 border border-brand-danger/25 rounded-2xl p-6 text-center">
      <AlertCircle className="mx-auto text-brand-danger mb-3" size={32} />
      <p className="text-sm font-semibold text-brand-ink">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 text-xs font-bold bg-brand-surface border border-brand-border px-4 py-2 rounded-2xl text-brand-ink hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary outline-none transition-colors"
        >
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-12 px-6 bg-brand-surface rounded-2xl border border-dashed border-brand-border">
      {Icon && <Icon className="mx-auto text-brand-muted mb-3 opacity-50" size={40} />}
      <p className="text-brand-ink font-bold text-base">{title}</p>
      {description && <p className="text-xs text-brand-muted mt-1.5 max-w-sm mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Marks a screen whose numbers are illustrative rather than measured.
 * Showing invented figures unlabelled is the fastest way to lose a user's
 * trust in every other number in the app.
 */
export function DemoBadge({ children = 'Sample data', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider bg-brand-amber/15 text-brand-amber border border-brand-amber/30 px-2.5 py-1 rounded-full ${className}`}
    >
      <Info size={11} />
      {children}
    </span>
  );
}

export function DemoNotice({ children }) {
  return (
    <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-2xl px-4 py-3 flex items-start gap-2.5">
      <Info size={16} className="text-brand-amber shrink-0 mt-0.5" />
      <p className="text-xs text-brand-ink/80 leading-relaxed">{children}</p>
    </div>
  );
}
