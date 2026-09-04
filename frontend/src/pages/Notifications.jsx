import { Activity, Bell } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { relativeTime } from '../lib/format';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';

export default function Notifications() {
  const { data, loading, error, reload } = useApi('/analytics/activities', { params: { limit: 30 } });

  return (
    <div className="space-y-5 pb-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2.5">
        <Bell className="text-brand-primary" size={22} />
        <div>
          <h2 className="text-xl font-bold text-brand-ink font-inter">Activity</h2>
          <p className="text-xs text-brand-muted">Everything that happened in your store</p>
        </div>
      </div>

      {loading ? (
        <CardSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState
          icon={Activity}
          title="Nothing has happened yet"
          description="Sales, stock changes and khata entries will all show up here as you use the app."
        />
      ) : (
        <ul className="space-y-3">
          {data.map((log) => (
            <li key={log.id} className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm flex items-start gap-3">
              <div className="bg-brand-bg p-2 rounded-lg text-brand-primary mt-0.5 shrink-0">
                <Activity size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="text-sm font-bold text-brand-ink">{log.action}</h3>
                  <time className="text-[10px] text-brand-muted font-semibold uppercase tracking-wider shrink-0" dateTime={log.created_at}>
                    {relativeTime(log.created_at)}
                  </time>
                </div>
                <p className="text-xs text-brand-muted mt-1 leading-relaxed">{log.details}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
