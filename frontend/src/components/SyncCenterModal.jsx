import { useEffect } from 'react';
import {
  Cloud, CloudOff, RefreshCw, X, CheckCircle2, Clock, AlertCircle, ShoppingBag, ArrowRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSync } from '../context/SyncContext';
import { money } from '../lib/format';
import { useToast } from './Toast';

export default function SyncCenterModal() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    isOnline,
    isSyncing,
    pendingCount,
    pendingSales,
    failedCount = 0,
    failedSales = [],
    lastSyncedAt,
    syncCenterOpen,
    syncError,
    syncNow,
    closeSyncCenter,
  } = useSync();

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeSyncCenter();
    if (syncCenterOpen) {
      window.addEventListener('keydown', onKey);
    }
    return () => window.removeEventListener('keydown', onKey);
  }, [syncCenterOpen, closeSyncCenter]);

  if (!syncCenterOpen) return null;

  const handleManualSync = async () => {
    try {
      const res = await syncNow();
      if (res && res.synced > 0) {
        toast.success(t('sync.synced_success', { count: res.synced }));
      } else if (res && res.skipped > 0) {
        toast.info(t('sync.already_synced'));
      } else {
        toast.info(t('sync.no_pending'));
      }
    } catch (err) {
      toast.error(err?.message || t('sync.sync_failed'));
    }
  };

  const formatSyncTime = (isoString) => {
    if (!isoString) return t('sync.never_synced');
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={t('sync.sync_center')}
      onClick={closeSyncCenter}
    >
      <div
        className="bg-brand-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col p-5 shadow-2xl border border-brand-border animate-in slide-in-from-bottom-6 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-brand-border/60">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isOnline ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              {isOnline ? <Cloud size={18} /> : <CloudOff size={18} />}
            </div>
            <div>
              <h3 className="font-bold text-base text-brand-ink font-inter leading-tight">
                {t('sync.sync_center')}
              </h3>
              <p className="text-[11px] text-brand-muted">
                {isOnline ? t('sync.online_ready') : t('sync.offline_mode')}
              </p>
            </div>
          </div>
          <button
            onClick={closeSyncCenter}
            aria-label="Close"
            className="text-brand-muted hover:text-brand-ink p-1.5 rounded-full hover:bg-brand-bg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Banner */}
        <div className="mt-3.5 p-3 rounded-2xl bg-brand-bg border border-brand-border/60 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-xs font-bold text-brand-ink">
                {isOnline ? t('sync.network_connected') : t('sync.network_disconnected')}
              </span>
            </div>
            <p className="text-[10px] text-brand-muted mt-0.5">
              {t('sync.last_synced')}: <span className="font-semibold text-brand-ink">{formatSyncTime(lastSyncedAt)}</span>
            </p>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing || !isOnline}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-brand-primary text-brand-on-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? t('sync.syncing') : t('sync.sync_now')}</span>
          </button>
        </div>

        {syncError && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-brand-danger/10 border border-brand-danger/20 flex items-start gap-2 text-xs text-brand-danger">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{syncError}</span>
          </div>
        )}

        {/* Pending Sales Section */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
            {t('sync.pending_bills', { count: pendingCount })}
          </span>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {pendingCount} {t('sync.waiting_upload')}
            </span>
          )}
        </div>

        <div className="mt-2 flex-1 overflow-y-auto space-y-2 max-h-[36vh] pr-1">
          {pendingCount === 0 ? (
            <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-sm font-bold text-brand-ink">{t('sync.all_synced_title')}</p>
              <p className="text-xs text-brand-muted max-w-xs">{t('sync.all_synced_desc')}</p>
            </div>
          ) : (
            pendingSales.map((sale) => (
              <div
                key={sale.offline_id}
                className="p-3 rounded-2xl bg-brand-bg/70 border border-brand-border flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-brand-ink truncate">
                      {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-brand-border/60 text-brand-ink uppercase">
                      {sale.payment_mode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-brand-muted">
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {sale.customer_name && (
                      <span className="truncate max-w-[100px]">· {sale.customer_name}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-extrabold text-brand-ink font-inter">
                    {money(sale.total_amount)}
                  </span>
                  <p className="text-[9px] font-semibold text-amber-500">
                    {t('sync.offline')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Failed Sales Section */}
        {failedCount > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-danger">
                Failed Bills ({failedCount})
              </span>
            </div>
            <div className="mt-1.5 space-y-1.5 max-h-[16vh] overflow-y-auto pr-1">
              {failedSales.map((sale) => (
                <div
                  key={sale.offline_id}
                  className="p-2.5 rounded-2xl bg-brand-danger/10 border border-brand-danger/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-brand-danger truncate">
                        {sale.items?.length || 0} items · {sale.payment_mode}
                      </span>
                    </div>
                    <p className="text-[10px] text-brand-danger/80 truncate mt-0.5">
                      {sale.sync_error || 'Validation error'}
                    </p>
                  </div>
                  <span className="text-xs font-extrabold text-brand-danger font-inter shrink-0">
                    {money(sale.total_amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kirana Explainer Footer */}
        <div className="mt-4 pt-3 border-t border-brand-border/50 text-[11px] text-brand-muted bg-brand-primary/5 -mx-5 -mb-5 p-4 rounded-b-3xl">
          <p className="leading-snug">
            💡 <strong className="text-brand-ink font-semibold">{t('sync.kirana_tip_title')}:</strong>{' '}
            {t('sync.kirana_tip_body')}
          </p>
        </div>
      </div>
    </div>
  );
}
