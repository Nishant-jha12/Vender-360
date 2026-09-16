import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookUser, Check, CloudOff, IndianRupee, Loader2, Minus, Package, Plus, QrCode,
  Search, ShoppingCart, Trash2, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage, isNetworkError } from '../lib/api';
import * as offlineDb from '../lib/offlineDb';
import { money, qty as fmtQty } from '../lib/format';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';
import CheckoutModal from '../components/CheckoutModal';

/**
 * The counter screen: search or tap, then charge.
 *
 * This is the screen the app was missing. Nothing previously recorded that a
 * customer bought anything, so stock only ever went up and every figure on the
 * dashboard was invented. A bill posted here is what makes the rest real.
 *
 * Designed for one thumb on a cheap phone with a customer waiting: frequent
 * items are one tap away, the cart total is always visible, and no modal sits
 * in the path of a cash sale.
 */
export default function Billing() {
  const { t } = useTranslation();
  const toast = useToast();
  const { vendor } = useAuth();
  const { isOnline, refreshPending, openSyncCenter } = useSync();

  const [frequent, setFrequent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [showKhataPicker, setShowKhataPicker] = useState(false);
  const [showUpi, setShowUpi] = useState(false);
  const [cartOpenOnMobile, setCartOpenOnMobile] = useState(false);

  const searchRef = useRef(null);

  const loadFrequent = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get('/inventory/frequent', { params: { limit: 12 } });
      setFrequent(res.data);
      offlineDb.cacheFrequent(res.data).catch(() => {});
    } catch (err) {
      // Offline fallback
      const cached = await offlineDb.getCachedFrequent();
      if (cached && cached.length > 0) {
        setFrequent(cached);
      } else if (err?.response?.status !== 401 && !isNetworkError(err)) {
        setLoadError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
      offlineDb.cacheCustomers(res.data).catch(() => {});
    } catch {
      const cached = await offlineDb.getCachedCustomers();
      if (cached && cached.length > 0) {
        setCustomers(cached);
      }
    }
  };

  useEffect(() => {
    loadFrequent();
    loadCustomers();

    const onSynced = () => {
      loadFrequent();
      loadCustomers();
    };
    window.addEventListener('vendor360:synced', onSynced);
    return () => window.removeEventListener('vendor360:synced', onSynced);
  }, []);

  // Debounced search with offline fallback
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      if (!isOnline) {
        offlineDb
          .getCachedProducts(term)
          .then((res) => setResults(res))
          .catch(() => setResults([]))
          .finally(() => setSearching(false));
      } else {
        api
          .get('/inventory', { params: { search: term, limit: 20 } })
          .then((res) => {
            setResults(res.data);
            offlineDb.cacheProducts(res.data).catch(() => {});
          })
          .catch(() => {
            offlineDb
              .getCachedProducts(term)
              .then((res) => setResults(res))
              .catch(() => setResults([]));
          })
          .finally(() => setSearching(false));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, isOnline]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty * line.unit_price, 0),
    [cart],
  );
  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.qty, 0), [cart]);

  const addToCart = (item) => {
    setCart((current) => {
      const existing = current.find((line) => line.item_id === item.id);
      if (existing) {
        return current.map((line) =>
          line.item_id === item.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        {
          item_id: item.id,
          sku_name: item.sku_name,
          unit: item.unit,
          unit_price: item.selling_price || 0,
          stock: item.current_qty,
          qty: 1,
        },
      ];
    });
    setSearch('');
    setResults([]);
    searchRef.current?.focus();
  };

  const changeQty = (itemId, delta) => {
    setCart((current) =>
      current
        .map((line) => (line.item_id === itemId ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    );
  };

  const setPrice = (itemId, value) => {
    const price = parseFloat(value);
    setCart((current) =>
      current.map((line) =>
        line.item_id === itemId ? { ...line, unit_price: Number.isFinite(price) ? price : 0 } : line,
      ),
    );
  };

  const removeLine = (itemId) =>
    setCart((current) => current.filter((line) => line.item_id !== itemId));

  const submitSale = async (paymentMode, customerId = null) => {
    if (!cart.length) return;
    setSubmitting(true);

    const saleItems = cart.map((line) => ({
      item_id: line.item_id,
      sku_name: line.sku_name,
      qty: line.qty,
      unit_price: line.unit_price,
    }));

    const selectedCust = customerId ? customers.find((c) => c.id === customerId) : null;

    // Fast-path: If currently offline, save directly to IndexedDB outbox
    if (!isOnline) {
      try {
        const offlineSale = await offlineDb.saveOfflineSale({
          payment_mode: paymentMode,
          customer_id: customerId,
          customer_name: selectedCust?.name,
          items: saleItems,
          note: null,
        });

        setLastSale(offlineSale);
        setCart([]);
        setCartOpenOnMobile(false);
        setShowKhataPicker(false);
        setShowUpi(false);
        toast.success(t('billing.offline_saved', { amount: money(offlineSale.total_amount) }));
        await refreshPending();

        // Local UI state updates for immediate reactivity
        setFrequent((prev) =>
          prev.map((it) => {
            const sold = saleItems.find((l) => l.item_id === it.id);
            if (!sold) return it;
            return { ...it, current_qty: Math.max(0, (it.current_qty || 0) - sold.qty) };
          })
        );

        if (customerId) {
          setCustomers((prev) =>
            prev.map((c) =>
              c.id === customerId
                ? { ...c, total_credit_balance: (c.total_credit_balance || 0) + offlineSale.total_amount }
                : c
            )
          );
        }
      } catch {
        toast.error(t('billing.offline_save_failed'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Online submission attempt
    try {
      const res = await api.post('/sales', {
        payment_mode: paymentMode,
        customer_id: customerId,
        items: saleItems,
      });

      setLastSale(res.data.sale);
      setCart([]);
      setCartOpenOnMobile(false);
      setShowKhataPicker(false);
      setShowUpi(false);
      toast.success(`${money(res.data.sale.total_amount)} recorded`);

      (res.data.stock_warnings || []).forEach((warning) => toast.warning(warning, 8000));

      loadFrequent();
      if (customerId) {
        loadCustomers();
      }
    } catch (err) {
      // If network connection dropped during checkout, preserve the bill offline
      if (isNetworkError(err)) {
        try {
          const offlineSale = await offlineDb.saveOfflineSale({
            payment_mode: paymentMode,
            customer_id: customerId,
            customer_name: selectedCust?.name,
            items: saleItems,
            note: null,
          });

          setLastSale(offlineSale);
          setCart([]);
          setCartOpenOnMobile(false);
          setShowKhataPicker(false);
          setShowUpi(false);
          toast.warning(t('billing.saved_offline_fallback'));
          await refreshPending();

          setFrequent((prev) =>
            prev.map((it) => {
              const sold = saleItems.find((l) => l.item_id === it.id);
              if (!sold) return it;
              return { ...it, current_qty: Math.max(0, (it.current_qty || 0) - sold.qty) };
            })
          );
        } catch {
          toast.error(errorMessage(err, 'Could not record the sale'));
        }
      } else {
        toast.error(errorMessage(err, 'Could not record the sale'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return <ErrorState message={loadError} onRetry={loadFrequent} />;
  }

  const showingSearch = search.trim().length >= 2;
  const gridItems = showingSearch ? results : frequent;

  return (
    <div className="pb-32 md:pb-6">
      <div className="grid md:grid-cols-5 gap-5">
        {/* ---------------- Product picker ---------------- */}
        <div className="md:col-span-3 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-brand-ink font-inter">{t('billing.title')}</h2>
            <p className="text-xs text-brand-muted mt-0.5">
              {t('billing.subtitle')}
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 text-brand-muted" size={18} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('billing.search_placeholder')}
              aria-label={t('common.search')}
              className="w-full bg-brand-surface border border-brand-border rounded-2xl pl-11 pr-10 py-3 text-sm text-brand-ink shadow-sm focus:outline-none focus-visible:ring-2 focus:ring-2 focus:ring-brand-primary transition-colors"
            />
            {searching && (
              <Loader2 className="absolute right-3.5 top-3.5 animate-spin text-brand-muted" size={18} />
            )}
          </div>

          {loading ? (
            <CardSkeleton rows={3} />
          ) : gridItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title={showingSearch ? 'Nothing matched that' : 'No products yet'}
              description={
                showingSearch
                  ? 'Try a shorter search, or add the product from the Stock page.'
                  : 'Add products under Stock, or load the sample catalogue from your Account page, and they will appear here.'
              }
            />
          ) : (
            <>
              {!showingSearch && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                  {frequent.some((i) => (i.sale_count || 0) > 0)
                    ? t('billing.sells_most_often')
                    : t('billing.your_products')}
                </p>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {gridItems.map((item) => {
                  const inCart = cart.find((line) => line.item_id === item.id);
                  const outOfStock = (item.current_qty || 0) <= 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`relative text-left bg-brand-surface border rounded-2xl p-3 min-h-[86px] flex flex-col justify-between shadow-sm active:scale-[0.97] transition-all focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${
                        inCart ? 'border-brand-primary ring-1 ring-brand-primary/30' : 'border-brand-border hover:border-brand-primary/50'
                      }`}
                    >
                      {inCart && (
                        <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-brand-primary text-brand-on-primary text-[11px] font-extrabold flex items-center justify-center">
                          {fmtQty(inCart.qty)}
                        </span>
                      )}
                      <p className="text-xs font-bold text-brand-ink leading-tight pr-6 line-clamp-2">
                        {item.sku_name}
                      </p>
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-sm font-extrabold text-brand-primary font-inter">
                          {money(item.selling_price)}
                        </span>
                        <span className={`text-[10px] font-semibold ${outOfStock ? 'text-brand-danger' : 'text-brand-muted'}`}>
                          {outOfStock ? 'Out of stock' : `${fmtQty(item.current_qty)} ${item.unit || ''}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {lastSale && cart.length === 0 && (
            <div
              className={`border rounded-2xl p-4 flex items-center gap-3 transition-colors ${
                lastSale.is_offline
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-brand-success/10 border-brand-success/30'
              }`}
            >
              {lastSale.is_offline ? (
                <CloudOff size={20} className="text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Check size={20} className="text-brand-success shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-brand-ink">
                    Last bill: {money(lastSale.total_amount)} ({lastSale.payment_mode})
                  </p>
                  {lastSale.is_offline && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      {t('billing.offline_badge')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-brand-muted truncate">
                  {lastSale.line_items?.length || 0} item(s) recorded
                  {lastSale.is_offline && ` · ${t('billing.queued_for_sync')}`}
                </p>
              </div>

              {lastSale.is_offline ? (
                <button
                  onClick={openSyncCenter}
                  className="text-[11px] font-bold text-brand-primary hover:underline shrink-0 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded px-1"
                >
                  {t('sync.sync_center')}
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      await api.delete(`/sales/${lastSale.id}`);
                      toast.info('Bill cancelled and stock restored');
                      setLastSale(null);
                      loadFrequent();
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                  className="text-[11px] font-bold text-brand-danger hover:underline shrink-0 focus-visible:ring-2 focus-visible:ring-brand-danger outline-none rounded px-1"
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---------------- Cart (desktop) ---------------- */}
        <div className="hidden md:block md:col-span-2">
          <div className="sticky top-4">
            <CartPanel
              cart={cart}
              total={total}
              submitting={submitting}
              onChangeQty={changeQty}
              onSetPrice={setPrice}
              onRemove={removeLine}
              onClear={() => setCart([])}
              onCash={() => submitSale('cash')}
              onUpi={() => setShowUpi(true)}
              onKhata={() => setShowKhataPicker(true)}
              upiReady={Boolean(vendor?.upi_id)}
            />
          </div>
        </div>
      </div>

      {/* ---------------- Cart (mobile bottom bar) ---------------- */}
      {cart.length > 0 && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40">
          {cartOpenOnMobile && (
            <div className="bg-brand-surface border-t border-brand-border max-h-[55vh] max-h-[55dvh] overflow-y-auto p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
              <CartLines
                cart={cart}
                onChangeQty={changeQty}
                onSetPrice={setPrice}
                onRemove={removeLine}
              />
              <div className="grid grid-cols-3 gap-2 mt-4">
                <PayButton label={t('billing.cash')} icon={IndianRupee} onClick={() => submitSale('cash')} disabled={submitting} primary />
                <PayButton label={t('billing.upi')} icon={QrCode} onClick={() => setShowUpi(true)} disabled={submitting} />
                <PayButton label={t('billing.khata')} icon={BookUser} onClick={() => setShowKhataPicker(true)} disabled={submitting} />
              </div>
            </div>
          )}
          <button
            onClick={() => setCartOpenOnMobile((open) => !open)}
            className="w-full bg-brand-primary text-brand-on-primary px-4 py-4 app-safe-bottom flex items-center justify-between shadow-lg"
            aria-expanded={cartOpenOnMobile}
          >
            <span className="flex items-center gap-2 font-bold text-sm">
              <ShoppingCart size={18} />
              {fmtQty(itemCount)} item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="font-extrabold text-lg font-inter">{money(total)}</span>
          </button>
        </div>
      )}

      {/* ---------------- Khata customer picker ---------------- */}
      {showKhataPicker && (
        <Modal title={t('billing.whose_khata')} onClose={() => setShowKhataPicker(false)}>
          {customers.length === 0 ? (
            <p className="text-sm text-brand-muted py-4 text-center">
              {t('billing.no_khata_customers')}
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => submitSale('khata', customer.id)}
                  disabled={submitting}
                  className="w-full text-left bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 flex justify-between items-center hover:border-brand-primary transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
                >
                  <div>
                    <p className="text-sm font-bold text-brand-ink">{customer.name}</p>
                    {customer.phone && <p className="text-[11px] text-brand-muted">{customer.phone}</p>}
                  </div>
                  <span className={`text-xs font-extrabold ${customer.total_credit_balance > 0 ? 'text-brand-danger' : 'text-brand-success'}`}>
                    {customer.total_credit_balance > 0
                      ? `${money(customer.total_credit_balance)} due`
                      : 'Settled'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      <CheckoutModal
        isOpen={showUpi}
        onClose={() => setShowUpi(false)}
        initialAmount={total}
        lockAmount
        onPaymentSuccess={() => submitSale('upi')}
      />
    </div>
  );
}

function CartPanel({
  cart, total, submitting, onChangeQty, onSetPrice, onRemove, onClear,
  onCash, onUpi, onKhata, upiReady,
}) {
  // Its own hook: `t` from the page component is not in scope down here, and a
  // build passes either way -- it would only fail when this panel rendered.
  const { t } = useTranslation();

  return (
    <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
        <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2">
          <ShoppingCart size={16} /> {t('billing.current_bill')}
        </h3>
        {cart.length > 0 && (
          <button
            onClick={onClear}
            className="text-[11px] font-bold text-brand-muted hover:text-brand-danger focus-visible:ring-2 focus-visible:ring-brand-danger outline-none rounded px-1"
          >
            Clear
          </button>
        )}
      </div>

      <div className="p-4">
        {cart.length === 0 ? (
          <p className="text-sm text-brand-muted text-center py-8">
            {t('billing.empty_hint')}
          </p>
        ) : (
          <>
            <CartLines cart={cart} onChangeQty={onChangeQty} onSetPrice={onSetPrice} onRemove={onRemove} />
            <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-brand-border">
              <span className="text-sm font-bold text-brand-ink">{t('billing.total')}</span>
              <span className="text-2xl font-extrabold text-brand-ink font-inter">{money(total)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <PayButton label="Cash" icon={IndianRupee} onClick={onCash} disabled={submitting} primary />
              <PayButton
                label="UPI"
                icon={QrCode}
                onClick={onUpi}
                disabled={submitting}
                title={upiReady ? undefined : 'Add your UPI ID under Account first'}
              />
              <PayButton label="Khata" icon={BookUser} onClick={onKhata} disabled={submitting} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CartLines({ cart, onChangeQty, onSetPrice, onRemove }) {
  return (
    <ul className="space-y-2.5">
      {cart.map((line) => (
        <li key={line.item_id} className="bg-brand-bg border border-brand-border rounded-2xl p-3">
          <div className="flex justify-between items-start gap-2">
            <p className="text-xs font-bold text-brand-ink leading-tight flex-1">{line.sku_name}</p>
            <button
              onClick={() => onRemove(line.item_id)}
              aria-label={`Remove ${line.sku_name}`}
              className="text-brand-muted hover:text-brand-danger shrink-0 focus-visible:ring-2 focus-visible:ring-brand-danger outline-none rounded p-0.5"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2.5 gap-2">
            <div className="flex items-center gap-1.5">
              <StepperButton onClick={() => onChangeQty(line.item_id, -1)} label={`One less ${line.sku_name}`}>
                <Minus size={14} />
              </StepperButton>
              <span className="w-9 text-center text-sm font-extrabold text-brand-ink font-inter">
                {fmtQty(line.qty)}
              </span>
              <StepperButton onClick={() => onChangeQty(line.item_id, 1)} label={`One more ${line.sku_name}`} primary>
                <Plus size={14} />
              </StepperButton>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[11px] text-brand-muted">₹</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={line.unit_price}
                onChange={(e) => onSetPrice(line.item_id, e.target.value)}
                aria-label={`Unit price for ${line.sku_name}`}
                className="w-16 bg-brand-surface border border-brand-border rounded-lg px-2 py-1 text-xs text-right font-bold text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <span className="w-16 text-right text-xs font-extrabold text-brand-ink">
                {money(line.qty * line.unit_price)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StepperButton({ onClick, children, label, primary }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold active:scale-95 transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${
        primary
          ? 'bg-brand-primary text-brand-on-primary'
          : 'bg-brand-surface border border-brand-border text-brand-ink'
      }`}
    >
      {children}
    </button>
  );
}

function PayButton({ label, icon: Icon, onClick, disabled, primary, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`py-3 rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${
        primary
          ? 'bg-brand-primary text-brand-on-primary shadow-md'
          : 'bg-brand-bg border border-brand-border text-brand-ink'
      }`}
    >
      {disabled ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function Modal({ title, children, onClose }) {
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
        className="bg-brand-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 shadow-2xl border border-brand-border"
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
