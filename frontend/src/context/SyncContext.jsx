import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api, isNetworkError } from '../lib/api';
import * as offlineDb from '../lib/offlineDb';

const SyncContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  pendingSales: [],
  lastSyncedAt: null,
  syncCenterOpen: false,
  syncError: null,
  syncNow: async () => {},
  refreshPending: async () => {},
  openSyncCenter: () => {},
  closeSyncCenter: () => {},
});

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingSales, setPendingSales] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const syncingRef = useRef(false);

  const refreshPending = useCallback(async () => {
    try {
      const sales = await offlineDb.getPendingSales();
      setPendingSales(sales);
      setPendingCount(sales.length);
    } catch {
      // IndexedDB might not be initialized or accessible yet
    }
  }, []);

  const pingServer = useCallback(async () => {
    try {
      await api.get('/health', { timeout: 3500 });
      return true;
    } catch (err) {
      if (isNetworkError(err)) return false;
      return true; // e.g. 404 or other response still means server reached
    }
  }, []);

  const syncNow = useCallback(async (silent = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const pending = await offlineDb.getPendingSales();
      if (!pending.length) {
        const now = new Date().toISOString();
        setLastSyncedAt(now);
        await offlineDb.setMeta('last_synced_at', now);
        return { synced: 0, skipped: 0 };
      }

      // Check real connectivity before flushing outbox
      const reachable = await pingServer();
      if (!reachable) {
        setIsOnline(false);
        throw new Error('Server unreachable');
      }
      setIsOnline(true);

      // Prepare batch payload
      const batchPayload = {
        sales: pending.map((sale) => ({
          offline_id: sale.offline_id,
          payment_mode: sale.payment_mode,
          customer_id: sale.customer_id,
          note: sale.note,
          items: sale.items.map((it) => ({
            item_id: it.item_id,
            sku_name: it.sku_name,
            qty: it.qty,
            unit_price: it.unit_price,
          })),
          created_at: sale.created_at,
        })),
      };

      const res = await api.post('/sales/sync-batch', batchPayload);
      const { synced_ids = [], duplicates_skipped = [], stock_warnings = [] } = res.data;

      // Mark all processed IDs as synced (remove from pending outbox)
      const toClear = [...synced_ids, ...duplicates_skipped];
      await offlineDb.markSalesSynced(toClear);

      const now = new Date().toISOString();
      setLastSyncedAt(now);
      await offlineDb.setMeta('last_synced_at', now);
      await refreshPending();

      // Dispatch global event for components to refresh their view
      window.dispatchEvent(
        new CustomEvent('vendor360:synced', {
          detail: {
            syncedCount: synced_ids.length,
            duplicatesCount: duplicates_skipped.length,
            warnings: stock_warnings,
          },
        })
      );

      return {
        synced: synced_ids.length,
        skipped: duplicates_skipped.length,
        warnings: stock_warnings,
      };
    } catch (err) {
      if (isNetworkError(err)) {
        setIsOnline(false);
      }
      const msg = err?.response?.data?.detail || err?.message || 'Sync failed';
      setSyncError(msg);
      if (!silent) throw err;
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [pingServer, refreshPending]);

  // Network event listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const alive = await pingServer();
      if (alive) {
        syncNow(true).catch(() => {});
      } else {
        setIsOnline(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load of meta and pending count
    offlineDb.getMeta('last_synced_at').then((saved) => {
      if (saved) setLastSyncedAt(saved);
    }).catch(() => {});

    refreshPending().then(() => {
      if (navigator.onLine) {
        syncNow(true).catch(() => {});
      }
    });

    // Periodic check every 30 seconds if online
    const interval = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        offlineDb.getPendingCount().then((count) => {
          if (count > 0) {
            syncNow(true).catch(() => {});
          }
        }).catch(() => {});
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [pingServer, syncNow, refreshPending]);

  const value = {
    isOnline,
    isSyncing,
    pendingCount,
    pendingSales,
    lastSyncedAt,
    syncCenterOpen,
    syncError,
    syncNow: () => syncNow(false),
    refreshPending,
    openSyncCenter: () => setSyncCenterOpen(true),
    closeSyncCenter: () => setSyncCenterOpen(false),
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}
