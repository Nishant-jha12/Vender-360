import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Clock, Loader2, MessageCircle, Search, Trash2,
  UserPlus, Users, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../lib/api';
import { money, relativeTime } from '../lib/format';
import { useToast } from '../components/Toast';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';

export default function KhataDashboard() {
  const { t } = useTranslation();
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [addingCustomer, setAddingCustomer] = useState(false);
  const [active, setActive] = useState(null); // { customer, mode: 'credit'|'payment'|'history' }
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
    } catch (err) {
      if (err?.response?.status !== 401) setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sendReminder = async (customer) => {
    try {
      const res = await api.get(`/customers/${customer.id}/reminder`);
      // Opening wa.me needs no API key and no cost, and WhatsApp is how this
      // money actually gets chased.
      window.open(res.data.whatsapp_url, '_blank', 'noopener');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const removeCustomer = async (customer) => {
    if (!window.confirm(`Remove ${customer.name} from your khata?`)) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      toast.success(`${customer.name} removed`);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const totalOutstanding = customers.reduce(
    (sum, c) => sum + Math.max(0, c.total_credit_balance || 0), 0,
  );
  const debtors = customers.filter((c) => (c.total_credit_balance || 0) > 0).length;

  const term = search.trim().toLowerCase();
  const filtered = term
    ? customers.filter(
        (c) => c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)),
      )
    : customers;

  return (
    <div className="space-y-4 md:space-y-5 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-ink font-inter">{t('khata.title')}</h2>
          <p className="text-xs text-brand-muted">{t('khata.subtitle')}</p>
        </div>
        <button onClick={() => setAddingCustomer(true)} className="text-xs bg-brand-primary text-brand-on-primary px-4 py-2 rounded-2xl font-bold flex items-center gap-1.5 shadow-sm self-start focus-visible:ring-2 focus-visible:ring-brand-primary outline-none">
          <UserPlus size={15} /> {t('khata.add_customer')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm">
          <p className="text-[11px] text-brand-muted uppercase tracking-wider font-bold">{t('khata.total_credit')}</p>
          <p className="text-xl md:text-2xl font-bold text-brand-danger mt-1 font-inter">{money(totalOutstanding)}</p>
        </div>
        <div className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm">
          <p className="text-[11px] text-brand-muted uppercase tracking-wider font-bold">{t('khata.active_borrowers')}</p>
          <p className="text-xl md:text-2xl font-bold text-brand-ink mt-1 font-inter">{debtors}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-brand-muted" size={18} aria-hidden="true" />
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('khata.search')} aria-label={t('khata.search')}
          className="w-full bg-brand-surface border border-brand-border rounded-2xl pl-11 pr-4 py-2.5 text-sm text-brand-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>

      {loading ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('khata.no_customers')}
          description="Add the customers you give udhaar to. Sales you put on khata from the billing screen will update their balance automatically."
          action={
            <button onClick={() => setAddingCustomer(true)} className="bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl">
              {t('khata.add_customer')}
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((customer) => {
            const balance = customer.total_credit_balance || 0;
            const inAdvance = balance < 0;
            return (
              <li key={customer.id} className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-ink text-sm">{customer.name}</p>
                    {customer.phone && <p className="text-[11px] text-brand-muted mt-0.5">{customer.phone}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-extrabold font-inter text-lg ${balance > 0 ? 'text-brand-danger' : inAdvance ? 'text-brand-primary' : 'text-brand-success'}`}>
                      {money(Math.abs(balance))}
                    </p>
                    <p className="text-[10px] uppercase font-bold text-brand-muted tracking-wide">
                      {/* An overpayment is money the shop is holding, not money owed. */}
                      {balance > 0 ? 'Outstanding' : inAdvance ? 'In advance' : t('khata.settled')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-brand-border">
                  <ActionChip onClick={() => setActive({ customer, mode: 'payment' })} icon={ArrowDownLeft} tone="success">
                    {t('khata.record_payment')}
                  </ActionChip>
                  <ActionChip onClick={() => setActive({ customer, mode: 'credit' })} icon={ArrowUpRight} tone="danger">
                    {t('khata.give_credit')}
                  </ActionChip>
                  <ActionChip onClick={() => setActive({ customer, mode: 'history' })} icon={Clock}>
                    {t('khata.history')}
                  </ActionChip>
                  {balance > 0 && customer.phone && (
                    <ActionChip onClick={() => sendReminder(customer)} icon={MessageCircle} tone="success">
                      Remind on WhatsApp
                    </ActionChip>
                  )}
                  {balance <= 0 && (
                    <ActionChip onClick={() => removeCustomer(customer)} icon={Trash2}>
                      Remove
                    </ActionChip>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {addingCustomer && (
        <AddCustomerModal
          onClose={() => setAddingCustomer(false)}
          onSaved={() => {
            setAddingCustomer(false);
            load();
          }}
        />
      )}

      {active?.mode === 'history' && (
        <HistoryModal customer={active.customer} onClose={() => setActive(null)} />
      )}

      {(active?.mode === 'credit' || active?.mode === 'payment') && (
        <TransactionModal
          customer={active.customer}
          mode={active.mode}
          submitting={submitting}
          onClose={() => setActive(null)}
          onSubmit={async (amount, notes) => {
            setSubmitting(true);
            try {
              await api.post(`/customers/${active.customer.id}/transaction`, {
                amount, transaction_type: active.mode, notes: notes || null,
              });
              toast.success(active.mode === 'payment' ? 'Payment recorded' : 'Credit recorded');
              setActive(null);
              load();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}
    </div>
  );
}

const CHIP_TONES = {
  success: 'text-brand-success border-brand-success/30 hover:bg-brand-success/10',
  danger: 'text-brand-danger border-brand-danger/30 hover:bg-brand-danger/10',
  default: 'text-brand-ink border-brand-border hover:bg-brand-bg',
};

function ActionChip({ onClick, icon: Icon, children, tone = 'default' }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${CHIP_TONES[tone]}`}
    >
      <Icon size={13} /> {children}
    </button>
  );
}

function AddCustomerModal({ onClose, onSaved }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', initial_credit_balance: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/customers', {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        initial_credit_balance: parseFloat(form.initial_credit_balance) || 0,
      });
      toast.success(`${form.name.trim()} added`);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={t('khata.add_customer')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Labelled label={t('khata.name')}>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ramesh Kumar" />
        </Labelled>
        <Labelled label={t('khata.phone')}>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+91 98765 43210" />
          <p className="text-[10px] text-brand-muted mt-1">Needed to send WhatsApp payment reminders.</p>
        </Labelled>
        <Labelled label="Existing balance (₹)">
          <input type="number" min="0" step="any" value={form.initial_credit_balance} onChange={(e) => setForm({ ...form, initial_credit_balance: e.target.value })} className={inputClass} placeholder="0" />
        </Labelled>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-bg border border-brand-border">Cancel</button>
          <button type="submit" disabled={saving || !form.name.trim()} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-on-primary bg-brand-primary disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={15} className="animate-spin" />} Add
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function TransactionModal({ customer, mode, onClose, onSubmit, submitting }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const isPayment = mode === 'payment';
  const balance = customer.total_credit_balance || 0;

  return (
    <ModalShell title={isPayment ? 'Record a payment' : 'Give credit'} onClose={onClose}>
      <p className="text-sm font-bold text-brand-ink">{customer.name}</p>
      <p className="text-xs text-brand-muted mb-4">
        {balance > 0 ? `${money(balance)} outstanding` : balance < 0 ? `${money(-balance)} held in advance` : 'Nothing outstanding'}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = parseFloat(amount);
          if (Number.isFinite(value) && value > 0) onSubmit(value, notes);
        }}
        className="space-y-3"
      >
        <div className="relative">
          <span className="absolute left-4 top-3 text-xl font-extrabold text-brand-primary">₹</span>
          <input
            type="number" step="any" min="0.01" required autoFocus value={amount}
            onChange={(e) => setAmount(e.target.value)} aria-label="Amount"
            className="w-full bg-brand-bg border border-brand-border rounded-2xl pl-10 pr-4 py-3 text-2xl font-extrabold text-brand-ink font-inter focus:outline-none focus:ring-2 focus:ring-brand-primary"
            placeholder="0"
          />
        </div>

        {isPayment && balance > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(balance))}
            className="w-full text-xs font-bold text-brand-primary bg-brand-primary/10 py-2 rounded-xl"
          >
            Settle the full {money(balance)}
          </button>
        )}

        {isPayment && parseFloat(amount) > balance && balance >= 0 && (
          <p className="text-[11px] text-brand-primary font-semibold bg-brand-primary/10 rounded-xl px-3 py-2">
            {money(parseFloat(amount) - balance)} more than owed — it will be kept as an advance.
          </p>
        )}

        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="Note (optional)" />

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-bg border border-brand-border">Cancel</button>
          <button type="submit" disabled={submitting || !parseFloat(amount)} className={`flex-1 py-2.5 rounded-2xl font-semibold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2 ${isPayment ? 'bg-brand-success' : 'bg-brand-danger'}`}>
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {isPayment ? 'Record payment' : 'Give credit'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function HistoryModal({ customer, onClose }) {
  const entries = [...(customer.khata_transactions || [])].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );

  return (
    <ModalShell title={`${customer.name} — history`} onClose={onClose}>
      {entries.length === 0 ? (
        <p className="text-sm text-brand-muted text-center py-6">No entries yet.</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map((entry) => {
            const isPayment = entry.transaction_type === 'payment';
            return (
              <li key={entry.id} className="flex justify-between items-center bg-brand-bg border border-brand-border rounded-2xl px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-brand-ink">
                    {isPayment ? 'Payment received' : 'Credit given'}
                  </p>
                  <p className="text-[11px] text-brand-muted truncate">
                    {entry.notes || '—'} · {relativeTime(entry.date)}
                  </p>
                </div>
                <span className={`text-sm font-extrabold shrink-0 ${isPayment ? 'text-brand-success' : 'text-brand-danger'}`}>
                  {isPayment ? '−' : '+'}{money(entry.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}

const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary';

function Labelled({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ModalShell({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="bg-brand-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 shadow-2xl border border-brand-border max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-brand-ink">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-brand-muted hover:text-brand-ink p-1 rounded-full hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-primary outline-none">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
