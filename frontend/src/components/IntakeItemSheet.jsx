import { useState } from 'react';
import { AlertTriangle, Box, Loader2, PackageOpen, Sparkles } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { money, qty as fmtQty } from '../lib/format';
import { useToast } from './Toast';
import ModalShell, { Field, inputClass } from './ModalShell';

const GST_RATES = [0, 5, 12, 18, 28];

const isoOrNull = (value) => (value ? new Date(value).toISOString() : null);
const dateInput = (value) => (value ? String(value).slice(0, 10) : '');

/**
 * The review step between scanning a box and it landing in stock.
 *
 * Two ways in, one form:
 *   - `suggestion` — a carton was scanned. The pack size is filled in from the
 *     product; the shopkeeper checks the count, batch and expiry off the actual
 *     box in their hands, because "+24" is not a number to write silently.
 *   - `barcode`    — the scan matched nothing. Same form, plus the few fields
 *     needed to create the product, so an unknown barcode costs one form once
 *     rather than a trip to the Inventory screen.
 */
export default function IntakeItemSheet({ suggestion, barcode, found, details, onClose, onAdded }) {
  const toast = useToast();
  const isNew = !suggestion;
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    // `found` is what the barcode itself yielded: name, brand and size from an
    // open product database. It is a starting point, not a fact -- every field
    // stays editable, and the price is never guessed.
    sku_name: suggestion?.sku_name || found?.sku_name || '',
    category: found?.category || 'General',
    unit: 'unit',
    packs: suggestion?.packs ?? 1,
    pack_type: suggestion ? 'carton' : 'loose',
    units_per_pack: suggestion?.units_per_pack ?? 1,
    unit_cost: suggestion?.unit_cost ?? 0,
    unit_price: suggestion?.unit_price ?? 0,
    gst_rate: suggestion?.gst_rate ?? 0,
    hsn_code: suggestion?.hsn_code || '',
    batch_no: '',
    mfg_date: dateInput(suggestion?.mfg_date),
    expiry_date: dateInput(suggestion?.expiry_date),
    remember: true,
  });

  const set = (field) => (e) =>
    setForm((current) => ({
      ...current,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const perPack = form.pack_type === 'carton' ? Number(form.units_per_pack) || 1 : 1;
  const packs = Number(form.packs) || 0;
  const units = Math.round(packs * perPack * 1000) / 1000;
  const taxable = units * (Number(form.unit_cost) || 0);
  const gst = (taxable * (Number(form.gst_rate) || 0)) / 100;

  // Recomputed from whatever date is in the box now, not just what the scan
  // suggested, so correcting the date updates the warning.
  // "Today" is captured once when the sheet opens rather than read during
  // every render, so the countdown cannot shift under the shopkeeper mid-edit.
  const [openedAt] = useState(() => Date.now());
  const daysToExpiry = form.expiry_date
    ? Math.ceil((new Date(form.expiry_date).getTime() - openedAt) / 86400000)
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (units <= 0) {
      toast.error('Enter how many are in the delivery');
      return;
    }
    setSaving(true);
    try {
      let itemId = suggestion?.item_id;

      if (isNew) {
        // Created with zero stock: the intake below is what moves it, so the
        // quantity is never counted twice.
        const created = await api.post('/inventory', {
          sku_name: form.sku_name.trim(),
          category: form.category.trim() || 'General',
          unit: form.unit.trim() || 'unit',
          current_qty: 0,
          cost_price: Number(form.unit_cost) || 0,
          selling_price: Number(form.unit_price) || 0,
          barcode: barcode || null,
          pack_type: form.pack_type,
          units_per_pack: perPack,
          hsn_code: form.hsn_code.trim() || null,
          gst_rate: Number(form.gst_rate) || 0,
        });
        itemId = created.data.id;
      }

      const res = await api.post('/intake/confirm', {
        item_id: itemId,
        packs,
        units_per_pack: perPack,
        unit_cost: Number(form.unit_cost) || 0,
        unit_price: Number(form.unit_price) || 0,
        gst_rate: Number(form.gst_rate) || 0,
        hsn_code: form.hsn_code.trim() || null,
        batch_no: form.batch_no.trim() || null,
        mfg_date: isoOrNull(form.mfg_date),
        expiry_date: isoOrNull(form.expiry_date),
        remember: form.remember,
      });

      toast.success(res.data.message);
      onAdded(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={isNew ? 'New product from this barcode' : 'Check the box'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {isNew ? (
          <>
            <p className="text-xs text-brand-muted -mt-2">
              Barcode <span className="font-mono font-bold text-brand-ink">{barcode}</span> isn&apos;t
              in your catalogue. Add it once — every future scan will know it.
              {details?.country && (
                <> Registered in <span className="text-brand-ink">{details.country}</span>.</>
              )}
            </p>

            {details?.check_digit_valid === false && (
              <div className="flex gap-2.5 items-start bg-brand-danger/10 border border-brand-danger/30 rounded-2xl p-3">
                <AlertTriangle size={16} className="text-brand-danger shrink-0 mt-0.5" />
                <p className="text-xs text-brand-ink">
                  This number fails its own check digit, so it was probably misread.
                  Scan it again before saving — a wrong barcode can never be scanned back.
                </p>
              </div>
            )}

            {found && (
              <div className="flex gap-3 items-start bg-brand-primary/5 border border-brand-primary/25 rounded-2xl p-3">
                {found.image_url ? (
                  <img
                    src={found.image_url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-contain bg-white shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <Sparkles size={16} className="text-brand-primary shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-brand-ink">Filled in from the barcode</p>
                  <p className="text-[11px] text-brand-muted mt-0.5">
                    {[found.brand, found.size].filter(Boolean).join(' · ')}
                    {found.source && <> — {found.source}</>}
                  </p>
                  <p className="text-[10px] text-brand-muted mt-1">
                    Check it against the packet. Prices are always yours to set.
                  </p>
                </div>
              </div>
            )}
            <Field label="Product name" required>
              <input required autoFocus value={form.sku_name} onChange={set('sku_name')} className={inputClass} placeholder="Maggi Noodles 70g" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <input value={form.category} onChange={set('category')} className={inputClass} placeholder="Snacks" />
              </Field>
              <Field label="Unit">
                <input value={form.unit} onChange={set('unit')} className={inputClass} placeholder="packets" />
              </Field>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 -mt-1 pb-1">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
              <Box size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-brand-ink truncate">{suggestion.sku_name}</p>
              <p className="text-xs text-brand-muted">Comes as a box of {fmtQty(suggestion.units_per_pack)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Comes as">
            <select value={form.pack_type} onChange={set('pack_type')} className={inputClass}>
              <option value="loose">Loose / single</option>
              <option value="carton">Carton / box</option>
            </select>
          </Field>
          <Field label={form.pack_type === 'carton' ? 'Units per box' : 'Units'}>
            <input
              type="number"
              step="any"
              min="1"
              disabled={form.pack_type !== 'carton'}
              value={form.pack_type === 'carton' ? form.units_per_pack : 1}
              onChange={set('units_per_pack')}
              className={`${inputClass} disabled:opacity-50`}
            />
          </Field>
        </div>

        <Field label={form.pack_type === 'carton' ? 'How many boxes' : 'How many units'} required>
          <input
            type="number"
            step="any"
            min="0"
            value={form.packs}
            onChange={set('packs')}
            className="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-center text-2xl font-extrabold text-brand-ink font-inter focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </Field>

        <div className="bg-brand-bg border border-brand-border rounded-2xl p-3 flex items-center gap-3">
          <PackageOpen size={18} className="text-brand-primary shrink-0" />
          <p className="text-sm text-brand-ink">
            Adds <span className="font-extrabold">{fmtQty(units)}</span> to stock
            {taxable > 0 && (
              <span className="text-brand-muted">
                {' '}· {money(taxable)} + {money(gst)} GST
              </span>
            )}
          </p>
        </div>

        {/* The last moment a short-dated carton can still be sent back. */}
        {daysToExpiry !== null && daysToExpiry <= 30 && (
          <div className="flex gap-2.5 items-start bg-brand-amber/10 border border-brand-amber/40 rounded-2xl p-3">
            <AlertTriangle size={16} className="text-brand-amber shrink-0 mt-0.5" />
            <p className="text-xs text-brand-ink">
              {daysToExpiry < 0
                ? 'This stock is already past its date.'
                : `This expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}.`}{' '}
              Check the printed date on the box before accepting it — you can refuse
              short-dated goods.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost per unit (₹)" hint="Before GST.">
            <input type="number" step="0.01" min="0" value={form.unit_cost} onChange={set('unit_cost')} className={inputClass} />
          </Field>
          <Field label="Selling price (₹)">
            <input type="number" step="0.01" min="0" value={form.unit_price} onChange={set('unit_price')} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="HSN code">
            <input value={form.hsn_code} onChange={set('hsn_code')} className={inputClass} placeholder="1902" />
          </Field>
          <Field label="GST rate">
            <select value={form.gst_rate} onChange={set('gst_rate')} className={inputClass}>
              {GST_RATES.map((rate) => (
                <option key={rate} value={rate}>{rate}%</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Batch number">
          <input value={form.batch_no} onChange={set('batch_no')} className={inputClass} placeholder="Printed on the box" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufactured">
            <input type="date" value={form.mfg_date} onChange={set('mfg_date')} className={inputClass} />
          </Field>
          <Field label="Expires">
            <input type="date" value={form.expiry_date} onChange={set('expiry_date')} className={inputClass} />
          </Field>
        </div>

        {!isNew && (
          <label className="flex items-start gap-2 text-xs text-brand-muted cursor-pointer">
            <input type="checkbox" checked={form.remember} onChange={set('remember')} className="mt-0.5 accent-[rgb(var(--brand-primary))]" />
            <span>Remember this pack size, price and expiry on the product, so the next delivery scans with nothing to type.</span>
          </label>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-bg border border-brand-border">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || units <= 0 || (isNew && !form.sku_name.trim())}
            className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-brand-on-primary bg-brand-primary disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Add {fmtQty(units)} to stock
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
