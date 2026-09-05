import { AlertTriangle, Download, Printer } from 'lucide-react';
import { money, qty as fmtQty, shortDate } from '../lib/format';
import { saveIntakePdf } from '../lib/intakePdf';
import { useToast } from './Toast';

/**
 * What the delivery came to: every line with its batch, dates and tax, totalled
 * and split by GST rate.
 *
 * The same markup is what prints -- `.print-sheet` is the only thing visible on
 * paper (see index.css), so there is one layout to keep right rather than a
 * screen version and a paper version that drift apart.
 */
export default function IntakeSummary({ summary, onNewDelivery }) {
  const toast = useToast();
  const {
    intake,
    store,
    totals,
    gst_breakup: breakup = [],
    gst_ready: gstReady,
    interstate,
    tax_basis_assumed: assumedBasis,
  } = summary;
  const lines = intake.lines || [];

  const savePdf = () => {
    try {
      saveIntakePdf(summary);
      toast.success('PDF saved');
    } catch (err) {
      toast.error('Could not build the PDF');
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 no-print">
        <button
          onClick={() => window.print()}
          className="flex-1 min-w-[8rem] py-2.5 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-surface border border-brand-border flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
        >
          <Printer size={16} /> Print
        </button>
        <button
          onClick={savePdf}
          className="flex-1 min-w-[8rem] py-2.5 rounded-2xl font-semibold text-sm text-brand-on-primary bg-brand-primary flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
        >
          <Download size={16} /> Save PDF
        </button>
      </div>

      {!gstReady && (
        <div className="no-print flex gap-2.5 items-start bg-brand-amber/10 border border-brand-amber/40 rounded-2xl p-3">
          <AlertTriangle size={16} className="text-brand-amber shrink-0 mt-0.5" />
          <p className="text-xs text-brand-ink">
            {!store?.gstin
              ? 'This prints as a stock record, not an input-tax claim — no GSTIN is saved on your store. Add one under Account.'
              : 'No GST was recorded on these items, so this is a stock record rather than an input-tax claim.'}
          </p>
        </div>
      )}

      <div className="print-sheet bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex justify-between items-start gap-4 pb-3 border-b border-brand-border">
          <div className="min-w-0">
            <h3 className="font-bold text-brand-ink font-inter truncate">{store?.name}</h3>
            <p className="text-[11px] text-brand-muted">
              {[store?.owner, store?.phone].filter(Boolean).join(' · ')}
            </p>
            {store?.gstin && <p className="text-[11px] text-brand-muted">GSTIN: {store.gstin}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm text-brand-ink">
              {gstReady ? 'Goods Received Note (GST)' : 'Goods Received Note'}
            </p>
            <p className="text-[11px] text-brand-muted">Ref {intake.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 py-3 text-[11px] border-b border-brand-border">
          <Detail label="Supplier" value={intake.supplier_name} />
          <Detail label="Supplier GSTIN" value={intake.supplier_gstin} />
          <Detail label="Invoice no." value={intake.invoice_no} />
          <Detail label="Invoice date" value={intake.invoice_date && shortDate(intake.invoice_date)} />
          <Detail label="Received" value={shortDate(intake.started_at)} />
          <Detail label="Closed" value={intake.closed_at ? shortDate(intake.closed_at) : 'In progress'} />
          {intake.note && <Detail label="Note" value={intake.note} />}
        </dl>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] mt-2 min-w-[38rem]">
            <thead>
              <tr className="text-left text-brand-muted border-b border-brand-border">
                <Th className="w-6">#</Th>
                <Th>Item</Th>
                <Th>HSN</Th>
                <Th>Batch</Th>
                <Th>MFD</Th>
                <Th>EXP</Th>
                <Th>Pack</Th>
                <Th right>Qty</Th>
                <Th right>Rate</Th>
                <Th right>Taxable</Th>
                <Th right>GST</Th>
                <Th right>Total</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id} className="border-b border-brand-border/60 align-top">
                  <Td className="text-brand-muted">{index + 1}</Td>
                  <Td className="font-semibold text-brand-ink">{line.sku_name}</Td>
                  <Td>{line.hsn_code || '—'}</Td>
                  <Td>{line.batch_no || '—'}</Td>
                  <Td>{line.mfg_date ? shortDate(line.mfg_date) : '—'}</Td>
                  <Td>{line.expiry_date ? shortDate(line.expiry_date) : '—'}</Td>
                  <Td>
                    {line.pack_type === 'carton'
                      ? `${fmtQty(line.packs)} × ${fmtQty(line.units_per_pack)}`
                      : 'Loose'}
                  </Td>
                  <Td right className="font-bold text-brand-ink">{fmtQty(line.qty_units)}</Td>
                  <Td right>{money(line.unit_cost)}</Td>
                  <Td right>{money(line.taxable_value)}</Td>
                  <Td right>{line.gst_rate ? `${fmtQty(line.gst_rate)}%` : '—'}</Td>
                  <Td right className="font-bold text-brand-ink">{money(line.line_total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-4">
          {breakup.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                GST breakup {interstate ? '· inter-state' : ''}
              </p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-brand-muted border-b border-brand-border">
                    <Th>Rate</Th>
                    <Th right>Taxable</Th>
                    {/* A supplier in another state is IGST at the full rate,
                        with nothing to split between CGST and SGST. */}
                    {interstate ? (
                      <Th right>IGST</Th>
                    ) : (
                      <>
                        <Th right>CGST</Th>
                        <Th right>SGST</Th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {breakup.map((row) => (
                    <tr key={row.rate} className="border-b border-brand-border/60">
                      <Td className="font-bold text-brand-ink">{fmtQty(row.rate)}%</Td>
                      <Td right>{money(row.taxable_value)}</Td>
                      {interstate ? (
                        <Td right>{money(row.igst)}</Td>
                      ) : (
                        <>
                          <Td right>{money(row.cgst)}</Td>
                          <Td right>{money(row.sgst)}</Td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <dl className="text-xs space-y-1.5 sm:pl-4">
            <Total label="Lines" value={totals.line_count} />
            <Total label="Units received" value={fmtQty(totals.total_units)} />
            <Total label="Taxable value" value={money(totals.taxable_value)} />
            <Total label="GST" value={money(totals.gst_amount)} />
            <div className="flex justify-between pt-1.5 border-t border-brand-border font-bold text-sm text-brand-ink">
              <dt>Grand total</dt>
              <dd>{money(totals.grand_total)}</dd>
            </div>
          </dl>
        </div>

        <p className="text-[9px] text-brand-muted pt-4 leading-relaxed">
          {gstReady
            ? 'Input-tax record. Quantities are what was counted at the counter.'
            : 'Stock record only — not an input-tax claim. Quantities are what was counted at the counter.'}{' '}
          {assumedBasis && totals.gst_amount > 0 && (
            <>
              Tax is split as CGST and SGST on the assumption of a local supplier; add the
              supplier&apos;s GSTIN to determine this from their state code.{' '}
            </>
          )}
          Generated by Vendor360 on {new Date(summary.generated_at).toLocaleString('en-IN')}.
        </p>
      </div>

      {onNewDelivery && (
        <button
          onClick={onNewDelivery}
          className="no-print w-full py-3 rounded-2xl font-semibold text-sm text-brand-ink bg-brand-surface border border-brand-border"
        >
          Start another delivery
        </button>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-bold text-brand-muted uppercase tracking-wider">{label}</dt>
      <dd className="text-brand-ink truncate">{value || '—'}</dd>
    </div>
  );
}

function Total({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-brand-muted">{label}</dt>
      <dd className="font-semibold text-brand-ink">{value}</dd>
    </div>
  );
}

function Th({ children, right, className = '' }) {
  return (
    <th className={`py-1.5 px-1 font-bold ${right ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, right, className = '' }) {
  return (
    <td className={`py-1.5 px-1 text-brand-muted ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  );
}
