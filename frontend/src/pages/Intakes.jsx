import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Calendar, Download, FileText, Package } from 'lucide-react';
import Papa from 'papaparse';
import { api, errorMessage } from '../lib/api';
import { money, qty as fmtQty, shortDate } from '../lib/format';
import { useToast } from '../components/Toast';
import { CardSkeleton, EmptyState, ErrorState } from '../components/States';
import IntakeSummary from '../components/IntakeSummary';

/**
 * Past deliveries, and the month totalled for filing.
 *
 * The summary endpoint has always existed; nothing called it, so a delivery
 * could be closed and printed but never found again -- which is most of the
 * point of keeping the record at all.
 */
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Intakes() {
  const toast = useToast();
  const [tab, setTab] = useState('deliveries'); // deliveries | register
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSummary, setOpenSummary] = useState(null);
  const [month, setMonth] = useState(thisMonth);
  const [register, setRegister] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/intake/sessions', { params: { limit: 50 } });
      setRows(res.data);
    } catch (err) {
      if (err?.response?.status !== 401) setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'register') return undefined;
    let cancelled = false;
    setRegister(null);
    api
      .get('/intake/register', { params: { month } })
      .then((res) => !cancelled && setRegister(res.data))
      .catch((err) => !cancelled && toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [tab, month, toast]);

  const openDelivery = async (row) => {
    try {
      const res = await api.get(`/intake/session/${row.id}/summary`);
      setOpenSummary(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const exportRegisterCsv = () => {
    if (!register?.entries?.length) return;
    const csv = Papa.unparse(
      register.entries.map((e) => ({
        Date: shortDate(e.date),
        Supplier: e.supplier_name || '',
        SupplierGSTIN: e.supplier_gstin || '',
        InvoiceNo: e.invoice_no || '',
        Basis: e.interstate ? 'Inter-state (IGST)' : 'Intra-state (CGST/SGST)',
        Lines: e.line_count,
        TaxableValue: e.taxable_value,
        GST: e.gst_amount,
        Total: e.grand_total,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor360-purchase-register-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  if (openSummary) {
    return (
      <div className="max-w-3xl mx-auto pb-24 space-y-4">
        <button
          onClick={() => setOpenSummary(null)}
          className="no-print text-sm font-semibold text-brand-muted hover:text-brand-primary flex items-center gap-1.5"
        >
          <ArrowLeft size={15} /> All deliveries
        </button>
        <IntakeSummary summary={openSummary} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-brand-ink font-inter">Deliveries</h2>
        <p className="text-xs text-brand-muted mt-0.5">
          Every stock intake, and the month totalled for your return.
        </p>
      </div>

      <div className="flex gap-2">
        {[
          ['deliveries', 'Deliveries'],
          ['register', 'Purchase register'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`text-xs font-bold px-4 py-2 rounded-2xl transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${
              tab === key
                ? 'bg-brand-primary text-brand-on-primary'
                : 'bg-brand-surface border border-brand-border text-brand-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'deliveries' && (
        loading ? (
          <CardSkeleton rows={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No deliveries yet"
            description="Scan a delivery in from the Scan screen and it will be kept here."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  onClick={() => openDelivery(row)}
                  className="w-full text-left bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-sm hover:border-brand-primary transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-brand-ink text-sm truncate">
                        {row.supplier_name || 'Unnamed supplier'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-brand-muted">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> {shortDate(row.started_at)}
                        </span>
                        {row.invoice_no && (
                          <span className="flex items-center gap-1">
                            <FileText size={11} /> {row.invoice_no}
                          </span>
                        )}
                        <span>{row.line_count} line{row.line_count === 1 ? '' : 's'}</span>
                        <span>{fmtQty(row.total_units)} units</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-brand-ink font-inter">
                        {money(row.grand_total)}
                      </p>
                      <span
                        className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          row.status === 'open'
                            ? 'bg-brand-amber/20 text-brand-amber'
                            : 'bg-brand-success/15 text-brand-success'
                        }`}
                      >
                        {row.status === 'open' ? 'In progress' : 'Closed'}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'register' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
              Month
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="ml-2 bg-brand-bg border border-brand-border rounded-2xl px-3 py-2 text-sm font-normal normal-case text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </label>
            <button
              onClick={exportRegisterCsv}
              disabled={!register?.entries?.length}
              className="ml-auto text-xs bg-brand-surface border border-brand-border px-3.5 py-2 rounded-2xl font-semibold text-brand-ink flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Download size={15} /> CSV
            </button>
          </div>

          {!register ? (
            <CardSkeleton rows={2} />
          ) : register.entries.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Nothing closed that month"
              description="Only closed deliveries appear on the register."
            />
          ) : (
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-sm space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  ['Deliveries', register.totals.deliveries],
                  ['Taxable value', money(register.totals.taxable_value)],
                  ['GST', money(register.totals.gst_amount)],
                  ['Total', money(register.totals.grand_total)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-brand-bg rounded-2xl p-3 border border-brand-border/60">
                    <p className="text-[9px] font-bold text-brand-muted uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-extrabold text-brand-ink font-inter mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[34rem]">
                  <thead>
                    <tr className="text-left text-brand-muted border-b border-brand-border">
                      <th className="py-1.5 pr-3 font-bold">Rate</th>
                      <th className="py-1.5 pr-3 font-bold text-right">Taxable</th>
                      <th className="py-1.5 pr-3 font-bold text-right">CGST</th>
                      <th className="py-1.5 pr-3 font-bold text-right">SGST</th>
                      <th className="py-1.5 font-bold text-right">IGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {register.gst_breakup.map((row) => (
                      <tr key={row.rate} className="border-b border-brand-border/60">
                        <td className="py-1.5 pr-3 font-bold text-brand-ink">{fmtQty(row.rate)}%</td>
                        <td className="py-1.5 pr-3 text-right text-brand-muted">{money(row.taxable_value)}</td>
                        <td className="py-1.5 pr-3 text-right text-brand-muted">{money(row.cgst)}</td>
                        <td className="py-1.5 pr-3 text-right text-brand-muted">{money(row.sgst)}</td>
                        <td className="py-1.5 text-right text-brand-muted">{money(row.igst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!register.gst_ready && (
                <p className="text-[11px] text-brand-muted">
                  This is a purchase summary, not an input-tax claim
                  {register.store.gstin ? ' — no GST was recorded on these items.' : ' — add your GSTIN under Account.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
