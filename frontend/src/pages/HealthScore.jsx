import { Link } from 'react-router-dom';
import { Info, ShieldCheck } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { money } from '../lib/format';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';

const LABELS = {
  sales_consistency: 'Sales consistency',
  inventory_turnover: 'Inventory turnover',
  waste_control: 'Waste control',
  on_time_restocking: 'Stock availability',
};

/**
 * A score computed from the shop's own behaviour, with every input on screen.
 * Previously this was the hardcoded integer 78 -- a made-up credit-readiness
 * number that someone could have made a real decision on.
 */
export default function HealthScore() {
  const { data, loading, error, reload } = useApi('/analytics/health-score');

  if (loading) return <CardSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (!data?.has_data) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Your score is not ready yet"
        description={data?.message || 'Record a few sales and the score will appear here.'}
        action={
          <Link to="/app/billing" className="inline-block bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl">
            Record a sale
          </Link>
        }
      />
    );
  }

  const { breakdown, weights, health_score: score } = data;
  const band = score >= 75 ? 'Strong' : score >= 50 ? 'Steady' : 'Needs attention';

  return (
    <div className="space-y-5 pb-6">
      <section className="bg-brand-primary text-brand-on-primary rounded-2xl p-6 text-center shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20" aria-hidden="true">
          <ShieldCheck size={100} />
        </div>
        <h2 className="text-sm font-semibold opacity-90 relative z-10">Store health score</h2>
        <p className="text-[11px] opacity-75 relative z-10 mb-4">
          From {data.sales_recorded} sales across {data.days_of_history} trading days
        </p>
        <div className="w-32 h-32 mx-auto rounded-full border-8 border-white/20 flex flex-col items-center justify-center relative z-10 bg-brand-primary-dark/30">
          <span className="text-4xl font-bold font-inter">{score}</span>
          <span className="text-[10px] opacity-80 uppercase tracking-widest mt-1">out of 100</span>
        </div>
        <div className="mt-5 inline-block bg-white/20 px-4 py-1.5 rounded-full text-xs font-semibold relative z-10">
          {band}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-brand-ink">How it is calculated</h3>
          <Info size={14} className="text-brand-muted" />
        </div>
        <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm p-2">
          {Object.entries(breakdown).map(([key, value]) => (
            <ScoreRow key={key} label={LABELS[key] || key} value={value} weight={weights?.[key]} />
          ))}
        </div>
        <p className="text-[11px] text-brand-muted mt-3 leading-relaxed px-1">
          Every input is measured from your own records. Consistency counts most
          because a steady shop is a predictable one.
          {data.expired_stock_value > 0 && (
            <> You currently have {money(data.expired_stock_value)} of expired stock dragging the score down.</>
          )}
        </p>
      </section>
    </div>
  );
}

function ScoreRow({ label, value, weight }) {
  const tone = value >= 70 ? 'bg-brand-success' : value >= 40 ? 'bg-brand-amber' : 'bg-brand-danger';
  return (
    <div className="p-3 flex items-center justify-between gap-3 border-b border-brand-bg last:border-0">
      <div className="w-2/5 min-w-0">
        <span className="text-xs font-semibold text-brand-ink block truncate">{label}</span>
        {weight && <span className="text-[10px] text-brand-muted">{weight}% of score</span>}
      </div>
      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 bg-brand-bg h-2 rounded-full overflow-hidden">
          <div className={`${tone} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
        </div>
        <span className="text-xs font-bold w-9 text-right text-brand-ink">{value}%</span>
      </div>
    </div>
  );
}
