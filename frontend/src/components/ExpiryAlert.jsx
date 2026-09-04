import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { money, qty as fmtQty, shortDate } from '../lib/format';
import { CardSkeleton } from './States';

/**
 * Stock about to expire, with a clearance price attached.
 *
 * The component now owns its heading, so the dashboard no longer renders a
 * "Critical Expiry Warning" title above nothing when there is nothing expiring.
 */
export default function ExpiryAlert({ compact = false }) {
  const { data, loading, error } = useApi('/inventory/expiring-soon', { params: { days: 7 } });

  if (loading) return <CardSkeleton rows={compact ? 1 : 2} />;
  if (error) return null; // A secondary panel shouldn't shout when the primary content loaded.

  const items = data || [];
  const totalLossRisk = items.reduce((sum, item) => sum + (item.estimated_loss_risk || 0), 0);

  if (items.length === 0) {
    return (
      <div className="bg-brand-success/10 border border-brand-success/25 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-brand-success shrink-0" />
        <div>
          <p className="text-sm font-bold text-brand-ink">Nothing expiring this week</p>
          <p className="text-xs text-brand-muted mt-0.5">Your fresh stock is all in date.</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <Link
        to="/app/stock"
        className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-brand-danger outline-none"
      >
        <div className="bg-brand-danger/10 border border-brand-danger/25 rounded-2xl p-4 flex items-start gap-3 hover:bg-brand-danger/15 transition-all">
          <div className="p-2 rounded-2xl bg-brand-danger/20 text-brand-danger shrink-0 mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-danger">
              {items.length} item{items.length === 1 ? '' : 's'} expiring this week
            </p>
            <p className="text-xs text-brand-danger/90 mt-1 truncate">
              {items.slice(0, 3).map((i) => `${i.sku_name} (${i.days_left}d)`).join(', ')}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-danger/20 text-[11px] font-semibold text-brand-danger">
              <span>At risk: {money(totalLossRisk)}</span>
              <span className="flex items-center gap-1">
                Review <ArrowRight size={12} />
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <section className="bg-brand-surface rounded-2xl border border-brand-danger/30 shadow-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-brand-danger/10 text-brand-danger border border-brand-danger/20">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-brand-ink">Expiring soon</h3>
            <p className="text-xs text-brand-muted mt-0.5">
              Clear these at a discount rather than write them off.
            </p>
          </div>
        </div>
        <div className="bg-brand-bg px-3 py-1.5 rounded-2xl border border-brand-border">
          <p className="text-[10px] text-brand-muted uppercase font-bold tracking-wider">Stock at risk</p>
          <p className="text-base font-extrabold text-brand-danger font-inter">{money(totalLossRisk)}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const isCritical = item.urgency === 'critical';
          return (
            <article
              key={item.id}
              className={`rounded-2xl p-3.5 border ${
                isCritical ? 'bg-brand-danger/5 border-brand-danger/25' : 'bg-brand-amber/5 border-brand-amber/25'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-brand-ink leading-tight">{item.sku_name}</h4>
                  <p className="text-[11px] text-brand-muted mt-0.5">
                    {fmtQty(item.current_qty)} {item.unit} in stock, cost {money(item.cost_price)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
                    isCritical ? 'bg-brand-danger text-white' : 'bg-brand-amber text-brand-ink'
                  }`}
                >
                  {item.days_left === 0 ? 'Today' : `${item.days_left}d left`}
                </span>
              </div>

              {/* The actionable part: a price that still beats throwing it away. */}
              <div className="mt-3 pt-2.5 border-t border-brand-border/60 flex items-center justify-between gap-2">
                <span className="text-[11px] text-brand-muted flex items-center gap-1">
                  <Clock size={12} /> {shortDate(item.expiry_date)}
                </span>
                <span className="text-[11px] font-bold text-brand-ink">
                  Sell at{' '}
                  <span className="text-brand-primary">{money(item.suggested_price)}</span>
                  <span className="text-brand-muted font-semibold"> (−{item.suggested_discount_pct}%)</span>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
