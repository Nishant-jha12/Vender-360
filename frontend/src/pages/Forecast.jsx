import { Link } from 'react-router-dom';
import { Package, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { money } from '../lib/format';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';

/**
 * Demand forecast, learned from this shop's own sales.
 *
 * This page used to render two hardcoded JSON objects labelled "AI". It now
 * says how much history it has and refuses to predict until there is enough --
 * a wrong prediction on day one costs the user's trust in every other number.
 */
export default function Forecast() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useApi('/analytics/forecast');
  const reorder = useApi('/analytics/reorder-list');

  if (loading) return <CardSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h2 className="text-xl font-bold text-brand-ink font-inter">{t('forecast_extra.title')}</h2>
        <p className="text-xs text-brand-muted mt-0.5">
          {data?.has_data ? data.method : t('forecast_extra.subtitle')}
        </p>
      </div>

      {!data?.has_data ? (
        <EmptyState
          icon={TrendingUp}
          title={t('forecast_extra.not_enough_history')}
          description={data?.message}
          action={
            <Link to="/app/billing" className="inline-block bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl">
              {t('forecast_extra.record_sale')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="bg-brand-primary/10 border border-brand-primary/25 rounded-2xl px-4 py-3">
            <p className="text-sm font-bold text-brand-primary">
              {t('forecast_extra.expected_for', { date: data.forecast_for })}
            </p>
            <p className="text-xs text-brand-primary/80 mt-0.5">
              {t('forecast_extra.compared_average', { days: data.days_of_history })}
            </p>
          </div>

          <ul className="space-y-3">
            {data.predictions.map((prediction) => {
              const rising = prediction.change_pct >= 0;
              return (
                <li key={prediction.sku_name} className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-brand-ink">{prediction.sku_name}</h3>
                      <p className="text-[11px] text-brand-muted mt-0.5">{prediction.driver}</p>
                    </div>
                    <span className={`flex items-center gap-1 text-sm font-extrabold shrink-0 ${rising ? 'text-brand-success' : 'text-brand-danger'}`}>
                      {rising ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                      {rising ? '+' : ''}{prediction.change_pct}%
                    </span>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-brand-border flex justify-between text-[11px] text-brand-muted">
                    <span>Typical day: <strong className="text-brand-ink">{money(prediction.daily_average)}</strong></span>
                    <span>Expected: <strong className="text-brand-ink">{money(prediction.expected_value)}</strong></span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {reorder.data?.has_data && (
        <section className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2">
              <Package size={16} className="text-brand-muted" /> Time to reorder
            </h3>
            <span className="text-[11px] font-bold text-brand-muted">
              ~{money(reorder.data.estimated_cost)}
            </span>
          </div>
          <ul className="space-y-1.5">
            {reorder.data.items.slice(0, 8).map((item) => (
              <li key={item.id} className="flex justify-between text-xs">
                <span className="text-brand-ink font-medium truncate pr-3">{item.sku_name}</span>
                <span className="text-brand-muted font-semibold shrink-0">
                  {item.suggested_qty} {item.unit}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              const text = encodeURIComponent(reorder.data.share_text);
              window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
            }}
            className="mt-3 w-full text-xs font-bold bg-brand-bg border border-brand-border py-2.5 rounded-2xl text-brand-ink hover:bg-brand-border/30 transition-colors"
          >
            Send this list to your wholesaler
          </button>
        </section>
      )}
    </div>
  );
}
