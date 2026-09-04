import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookUser, Mic, Package, Receipt, ScanLine, ShoppingCart, TrendingUp, Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { useChartTheme } from '../hooks/useChartTheme';
import { money, moneyWhole } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import ExpiryAlert from '../components/ExpiryAlert';
import { EmptyState, ErrorState, StatSkeleton } from '../components/States';

export default function Dashboard() {
  const { t } = useTranslation();
  const { storeName } = useAuth();
  const colors = useChartTheme();

  const trend = useApi('/analytics/sales-trend', { params: { days: 7 } });
  const dayClose = useApi('/sales/day-close');
  const health = useApi('/analytics/health-score');

  const data = trend.data;
  const hasSales = data?.has_data;

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h2 className="text-xl font-bold text-brand-ink font-inter">{storeName}</h2>
        <p className="text-xs text-brand-muted mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Primary action. Billing is the thing done fifty times a day. */}
      <Link
        to="/app/billing"
        className="block bg-brand-primary text-brand-on-primary rounded-2xl p-5 shadow-lg hover:bg-brand-primary-dark transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20">
              <ShoppingCart size={24} />
            </div>
            <div>
              <h3 className="font-extrabold text-lg font-inter">Start a bill</h3>
              <p className="text-xs opacity-80">Cash, UPI or khata — recorded in seconds</p>
            </div>
          </div>
          <TrendingUp size={22} className="opacity-60 shrink-0" />
        </div>
      </Link>

      {/* Today's numbers */}
      {trend.loading ? (
        <StatSkeleton />
      ) : trend.error ? (
        <ErrorState message={trend.error} onRetry={trend.reload} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard label={t('dashboard.sales_today')} value={money(data.today_sales)} />
          <StatCard
            label="Today's profit"
            value={money(data.today_profit)}
            accent="text-brand-success"
            sub={data.today_sales > 0 ? `${data.margin_pct}% margin` : null}
          />
          <StatCard label="Bills today" value={String(data.today_bills)} sub={`${moneyWhole(data.week_sales)} this week`} />
          <StatCard
            label={t('dashboard.health_score')}
            value={health.data?.has_data ? `${health.data.health_score}/100` : '—'}
            accent="text-brand-amber"
            sub={health.data?.has_data ? null : 'Needs 5 sales'}
          />
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 md:gap-5">
        <div className="md:col-span-2 space-y-4 md:space-y-5">
          {/* 7-day trend */}
          <section className="bg-brand-surface rounded-2xl p-4 md:p-6 shadow-sm border border-brand-border">
            <h3 className="text-sm md:text-base font-semibold text-brand-ink mb-4">Last 7 days</h3>
            {trend.loading ? (
              <div className="h-48 md:h-64 animate-pulse bg-brand-border/40 rounded-xl" />
            ) : !hasSales ? (
              <EmptyState
                icon={Receipt}
                title="No sales recorded yet"
                description="Once you bill your first customer, your revenue and profit will appear here. Nothing on this dashboard is estimated — it is all read from your own bills."
                action={
                  <Link
                    to="/app/billing"
                    className="inline-block bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl"
                  >
                    Create your first bill
                  </Link>
                }
              />
            ) : (
              <div className="w-full h-48 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: colors.muted }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: colors.muted }}
                      tickFormatter={(value) => `₹${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: `1px solid ${colors.border}`,
                        background: colors.surface,
                        color: colors.ink,
                        fontSize: '12px',
                      }}
                      labelStyle={{ fontWeight: 700, color: colors.ink }}
                      formatter={(value, name) => [money(value), name]}
                    />
                    <Line
                      type="monotone" dataKey="sales" name="Sales" stroke={colors.primary} strokeWidth={3}
                      dot={{ r: 3, fill: colors.primary, strokeWidth: 2, stroke: colors.surface }}
                      activeDot={{ r: 6 }}
                    />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke={colors.amber} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Day close */}
          {dayClose.data?.bill_count > 0 && (
            <section className="bg-brand-surface rounded-2xl p-4 md:p-5 shadow-sm border border-brand-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm md:text-base font-semibold text-brand-ink flex items-center gap-2">
                  <Wallet size={16} className="text-brand-muted" /> Today's close
                </h3>
                <span className="text-[11px] text-brand-muted font-semibold">
                  {dayClose.data.bill_count} bills · avg {money(dayClose.data.average_bill)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <ModeCard label="Cash" value={dayClose.data.by_payment_mode.cash} accent="text-brand-success" />
                <ModeCard label="UPI" value={dayClose.data.by_payment_mode.upi} accent="text-brand-primary" />
                <ModeCard label="On khata" value={dayClose.data.by_payment_mode.khata} accent="text-brand-danger" />
              </div>
              {dayClose.data.top_items?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-brand-border">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-muted mb-2">
                    Best sellers today
                  </p>
                  <ul className="space-y-1.5">
                    {dayClose.data.top_items.slice(0, 3).map((item) => (
                      <li key={item.sku_name} className="flex justify-between text-xs">
                        <span className="text-brand-ink font-medium truncate pr-3">{item.sku_name}</span>
                        <span className="text-brand-muted font-semibold shrink-0">{money(item.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Quick actions */}
          <section>
            <h3 className="text-sm md:text-base font-semibold text-brand-ink mb-3">
              {t('dashboard.quick_actions')}
            </h3>
            <div className="grid grid-cols-4 gap-2 md:gap-3">
              <QuickAction to="/app/stock" icon={Package} label={t('nav.stock')} tone="primary" />
              <QuickAction to="/app/khata" icon={BookUser} label={t('nav.khata')} tone="danger" />
              <QuickAction to="/app/log" icon={Mic} label={t('dashboard.voice_log')} tone="amber" />
              <QuickAction to="/app/scan" icon={ScanLine} label={t('dashboard.scan')} tone="primary" />
            </div>
          </section>
        </div>

        <div className="space-y-4 md:space-y-5">
          <div>
            <h3 className="text-sm md:text-base font-semibold text-brand-ink mb-3">Stock watch</h3>
            <ExpiryAlert compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent = 'text-brand-ink' }) {
  return (
    <div className="bg-brand-surface rounded-2xl p-4 shadow-sm border border-brand-border">
      <p className="text-[11px] text-brand-muted uppercase tracking-wider font-bold">{label}</p>
      <p className={`text-xl md:text-2xl font-bold mt-1 font-inter ${accent}`}>{value}</p>
      {sub && <p className="text-[10px] text-brand-muted mt-0.5 font-semibold">{sub}</p>}
    </div>
  );
}

function ModeCard({ label, value, accent }) {
  return (
    <div className="bg-brand-bg rounded-2xl p-3 border border-brand-border text-center">
      <p className="text-[10px] uppercase font-bold tracking-wider text-brand-muted">{label}</p>
      <p className={`text-sm font-extrabold font-inter mt-1 ${accent}`}>{money(value)}</p>
    </div>
  );
}

const TONES = {
  primary: 'bg-brand-primary/10 text-brand-primary',
  amber: 'bg-brand-amber/10 text-brand-amber',
  danger: 'bg-brand-danger/10 text-brand-danger',
};

function QuickAction({ to, icon: Icon, label, tone }) {
  return (
    <Link
      to={to}
      className="bg-brand-surface rounded-2xl p-3 md:p-4 border border-brand-border shadow-sm flex flex-col items-center justify-center text-center gap-2 hover:border-brand-primary/50 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
    >
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center ${TONES[tone]}`}>
        <Icon className="w-5 h-5 md:w-6 md:h-6" />
      </div>
      <span className="text-[10px] md:text-xs font-semibold text-brand-ink">{label}</span>
    </Link>
  );
}
