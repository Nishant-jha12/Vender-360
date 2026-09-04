import { useEffect, useState } from 'react';
import {
  Barcode, Calendar, Download, FileText, Loader2, Package, Pencil, Plus, Search, Trash2, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
// jspdf 4.x exports the constructor as a NAMED export; the default export is
// a namespace object, so `import jsPDF from 'jspdf'` gives "not a constructor".
import { jsPDF } from 'jspdf';
// jspdf-autotable v5 removed the doc.autoTable() prototype patch. The old
// `import 'jspdf-autotable'` + `doc.autoTable(...)` threw "not a function",
// so Export PDF never worked.
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { api, errorMessage } from '../lib/api';
import { money, qty as fmtQty, shortDate } from '../lib/format';
import { useToast } from '../components/Toast';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';
import ExpiryAlert from '../components/ExpiryAlert';

const BLANK_ITEM = {
  sku_name: '', category: 'General', unit: 'unit', current_qty: 0,
  reorder_point: 10, cost_price: 0, selling_price: 0, expiry_date: '', barcode: '',
};

export default function Inventory() {
  const { t } = useTranslation();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null); // item object, or BLANK_ITEM for new
  const [adjusting, setAdjusting] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/inventory');
      setItems(res.data);
    } catch (err) {
      if (err?.response?.status !== 401) setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.sku_name} from your catalogue?`)) return;
    try {
      await api.delete(`/inventory/${item.id}`);
      toast.success(`${item.sku_name} removed`);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Vendor360 — Inventory Report', 14, 16);
      doc.setFontSize(9);
      doc.text(new Date().toLocaleString('en-IN'), 14, 22);

      autoTable(doc, {
        startY: 28,
        head: [['Item', 'Category', 'Qty', 'Cost', 'Price', 'Expiry', 'Barcode']],
        body: items.map((item) => [
          item.sku_name,
          item.category || '-',
          `${fmtQty(item.current_qty)} ${item.unit || ''}`,
          `Rs ${item.cost_price}`,
          `Rs ${item.selling_price}`,
          item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN') : '-',
          item.barcode || '-',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [26, 115, 232] },
      });

      doc.save(`vendor360-inventory-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Could not build the PDF');
      console.error(err);
    }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(
      items.map((item) => ({
        Item: item.sku_name,
        Category: item.category,
        Quantity: item.current_qty,
        Unit: item.unit,
        CostPrice: item.cost_price,
        SellingPrice: item.selling_price,
        ReorderPoint: item.reorder_point,
        ExpiryDate: item.expiry_date ? item.expiry_date.slice(0, 10) : '',
        Barcode: item.barcode || '',
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor360-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const term = search.trim().toLowerCase();
  const filtered = term
    ? items.filter(
        (i) => i.sku_name.toLowerCase().includes(term) || (i.barcode && i.barcode.includes(term)),
      )
    : items;

  return (
    <div className="space-y-4 md:space-y-5 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-ink font-inter">{t('inventory.title')}</h2>
          <p className="text-xs text-brand-muted">{items.length} product{items.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing({ ...BLANK_ITEM })} className="text-xs bg-brand-primary text-brand-on-primary px-4 py-2 rounded-2xl font-bold flex items-center gap-1.5 shadow-sm hover:bg-brand-primary-dark transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none">
            <Plus size={15} /> Add product
          </button>
          <button onClick={exportCSV} disabled={!items.length} className="text-xs bg-brand-surface border border-brand-border px-3.5 py-2 rounded-2xl font-semibold text-brand-ink flex items-center gap-1.5 shadow-sm hover:bg-brand-bg transition-colors disabled:opacity-50">
            <FileText size={15} /> CSV
          </button>
          <button onClick={exportPDF} disabled={!items.length} className="text-xs bg-brand-surface border border-brand-border px-3.5 py-2 rounded-2xl font-semibold text-brand-ink flex items-center gap-1.5 shadow-sm hover:bg-brand-bg transition-colors disabled:opacity-50">
            <Download size={15} /> PDF
          </button>
        </div>
      </div>

      <ExpiryAlert />

      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-brand-muted" size={18} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or barcode number..."
          aria-label="Search inventory"
          className="w-full bg-brand-surface border border-brand-border rounded-2xl pl-11 pr-4 py-2.5 text-sm text-brand-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>

      {loading ? (
        <CardSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Your catalogue is empty"
          description="Add the products you sell, and they will show up on the billing screen ready to tap."
          action={
            <button onClick={() => setEditing({ ...BLANK_ITEM })} className="bg-brand-primary text-brand-on-primary text-xs font-bold px-5 py-2.5 rounded-2xl">
              Add your first product
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Nothing matched that search" description="Try a shorter term." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const lowStock = item.current_qty <= item.reorder_point;
            const nearExpiry =
              item.expiry_date && new Date(item.expiry_date) <= new Date(Date.now() + 7 * 86400000);
            return (
              <li key={item.id} className="bg-brand-surface rounded-2xl p-4 border border-brand-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-md transition-all">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-brand-ink text-sm md:text-base">{item.sku_name}</p>
                    {nearExpiry && (
                      <span className="text-[10px] bg-brand-danger/15 text-brand-danger px-2 py-0.5 rounded-md font-extrabold uppercase">
                        Expiring soon
                      </span>
                    )}
                    {lowStock && (
                      <span className="text-[10px] bg-brand-amber/20 text-brand-amber px-2 py-0.5 rounded-md font-extrabold uppercase">
                        Low stock
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-brand-muted bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border/60">
                      {item.category}
                    </span>
                    <span className="text-[11px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md font-bold">
                      Cost {money(item.cost_price)} · Sell {money(item.selling_price)}
                    </span>
                    {item.expiry_date && (
                      <span className="text-[11px] text-brand-muted flex items-center gap-1">
                        <Calendar size={11} /> {shortDate(item.expiry_date)}
                      </span>
                    )}
                    {item.barcode && (
                      <span className="text-[10px] font-mono text-brand-muted flex items-center gap-1 bg-brand-bg px-1.5 py-0.5 rounded border border-brand-border">
                        <Barcode size={12} /> {item.barcode}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-brand-border/60">
                  <div className="text-right">
                    <p className={`font-extrabold font-inter text-lg ${lowStock ? 'text-brand-danger' : 'text-brand-ink'}`}>
                      {fmtQty(item.current_qty)}
                    </p>
                    <p className="text-[10px] uppercase font-bold text-brand-muted">{item.unit}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <IconButton onClick={() => setAdjusting(item)} label={`Adjust stock for ${item.sku_name}`}>
                      <Plus size={16} />
                    </IconButton>
                    <IconButton onClick={() => setEditing(item)} label={`Edit ${item.sku_name}`}>
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton onClick={() => remove(item)} label={`Delete ${item.sku_name}`} danger>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ItemFormModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {adjusting && (
        <AdjustModal
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function IconButton({ onClick, children, label, danger }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-9 h-9 rounded-2xl border flex items-center justify-center active:scale-95 transition-all shadow-sm focus-visible:ring-2 outline-none ${
        danger
          ? 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-danger hover:border-brand-danger/40 focus-visible:ring-brand-danger'
          : 'bg-brand-bg border-brand-border text-brand-ink hover:text-brand-primary hover:border-brand-primary/40 focus-visible:ring-brand-primary'
      }`}
    >
      {children}
    </button>
  );
}

function ItemFormModal({ item, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !item.id;
  const [form, setForm] = useState({
    ...item,
    expiry_date: item.expiry_date ? item.expiry_date.slice(0, 10) : '',
    barcode: item.barcode || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        sku_name: form.sku_name.trim(),
        category: form.category?.trim() || 'General',
        unit: form.unit?.trim() || 'unit',
        current_qty: parseFloat(form.current_qty) || 0,
        reorder_point: parseFloat(form.reorder_point) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        selling_price: parseFloat(form.selling_price) || 0,
        expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null,
        barcode: form.barcode?.trim() || null,
      };
      if (isNew) await api.post('/inventory', payload);
      else await api.put(`/inventory/${item.id}`, payload);

      toast.success(isNew ? `${payload.sku_name} added` : `${payload.sku_name} updated`);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const margin =
    form.selling_price > 0 && form.cost_price > 0
      ? Math.round(((form.selling_price - form.cost_price) / form.selling_price) * 100)
      : null;

  return (
    <ModalShell title={isNew ? 'Add product' : 'Edit product'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Product name" required>
          <input required value={form.sku_name} onChange={set('sku_name')} className={inputClass} placeholder="Amul Taaza Milk 500ml" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input value={form.category} onChange={set('category')} className={inputClass} placeholder="Dairy" />
          </Field>
          <Field label="Unit">
            <input value={form.unit} onChange={set('unit')} className={inputClass} placeholder="packets" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost price (₹)">
            <input type="number" step="0.01" min="0" value={form.cost_price} onChange={set('cost_price')} className={inputClass} />
          </Field>
          <Field label="Selling price (₹)">
            <input type="number" step="0.01" min="0" value={form.selling_price} onChange={set('selling_price')} className={inputClass} />
          </Field>
        </div>

        {margin !== null && (
          <p className={`text-[11px] font-bold ${margin < 0 ? 'text-brand-danger' : 'text-brand-success'}`}>
            {margin < 0 ? `Selling below cost — you lose ${money(form.cost_price - form.selling_price)} per unit` : `Margin: ${margin}%`}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity in stock">
            <input type="number" step="any" min="0" value={form.current_qty} onChange={set('current_qty')} className={inputClass} />
          </Field>
          <Field label="Reorder point">
            <input type="number" step="any" min="0" value={form.reorder_point} onChange={set('reorder_point')} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Expiry date">
            <input type="date" value={form.expiry_date} onChange={set('expiry_date')} className={inputClass} />
          </Field>
          <Field label="Barcode">
            <input value={form.barcode} onChange={set('barcode')} className={inputClass} placeholder="8901262010053" />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-bg border border-brand-border">
            Cancel
          </button>
          <button type="submit" disabled={saving || !form.sku_name.trim()} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-on-primary bg-brand-primary disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={15} className="animate-spin" />}
            {isNew ? 'Add product' : 'Save changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function AdjustModal({ item, onClose, onSaved }) {
  const toast = useToast();
  const [delta, setDelta] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!delta) return;
    setSaving(true);
    try {
      await api.post(`/inventory/${item.id}/adjust`, {
        qty_change: Number(delta),
        reason: Number(delta) > 0 ? 'Restocked' : 'Stock correction',
      });
      toast.success(`${item.sku_name} updated`);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resulting = Math.max(0, item.current_qty + Number(delta || 0));

  return (
    <ModalShell title="Adjust stock" onClose={onClose}>
      <p className="text-sm text-brand-muted mb-1">{item.sku_name}</p>
      <p className="text-xs text-brand-muted mb-4">
        Currently {fmtQty(item.current_qty)} {item.unit}
      </p>

      {/* A typed number and quick chips, rather than tapping +1 fifty times. */}
      <input
        type="number"
        step="any"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        aria-label="Quantity change"
        className="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-center text-2xl font-extrabold text-brand-ink font-inter focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      <div className="flex flex-wrap justify-center gap-2 mt-3">
        {[-10, -5, -1, 1, 5, 10, 25, 50].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDelta((current) => Number(current || 0) + value)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-brand-ink hover:border-brand-primary transition-colors"
          >
            {value > 0 ? `+${value}` : value}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-brand-muted mt-4">
        New quantity: <span className="font-bold text-brand-ink">{fmtQty(resulting)} {item.unit}</span>
      </p>

      <div className="flex gap-3 mt-5">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-bg border border-brand-border">
          Cancel
        </button>
        <button onClick={submit} disabled={saving || !Number(delta)} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-on-primary bg-brand-primary disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={15} className="animate-spin" />} Confirm
        </button>
      </div>
    </ModalShell>
  );
}

const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary';

function Field({ label, children, required }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
        {label}{required && <span className="text-brand-danger"> *</span>}
      </span>
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
