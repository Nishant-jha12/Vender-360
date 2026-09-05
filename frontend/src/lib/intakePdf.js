// jspdf v4 ships a namespace object, so the default import is not a
// constructor; jspdf-autotable v5 dropped the doc.autoTable() prototype patch.
// Both of these bit this repo before -- see Inventory.jsx.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND = [26, 115, 232];

// jsPDF's built-in fonts have no rupee glyph, so printed money says "Rs".
const rs = (value) =>
  `Rs ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');

const num = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

/** Filename for a summary, stable enough to find again months later. */
export function intakeFileName(summary) {
  const stamp = new Date(summary?.intake?.started_at || Date.now()).toISOString().slice(0, 10);
  const supplier = (summary?.intake?.supplier_name || 'stock-intake')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `vendor360-${supplier || 'stock-intake'}-${stamp}.pdf`;
}

/**
 * Render a closed (or in-progress) intake as a goods-received note.
 *
 * The document only calls itself a tax record when it actually is one: with no
 * store GSTIN, or nothing charged as GST, it prints as a plain stock note and
 * says why. A shopkeeper filing this should not find out at the counter that it
 * was never claimable.
 */
export function buildIntakePdf(summary) {
  const {
    intake,
    store,
    totals,
    gst_breakup: breakup = [],
    gst_ready: gstReady,
    interstate,
    tax_basis_assumed: assumedBasis,
  } = summary;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text(store?.name || 'Vendor360', 14, 16);

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  const storeLines = [store?.owner, store?.phone, store?.gstin ? `GSTIN: ${store.gstin}` : null]
    .filter(Boolean)
    .join('  ·  ');
  if (storeLines) doc.text(storeLines, 14, 21.5);

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(gstReady ? 'Goods Received Note (GST)' : 'Goods Received Note', pageWidth - 14, 16, {
    align: 'right',
  });
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text(`Ref ${intake.id.slice(0, 8).toUpperCase()}`, pageWidth - 14, 21, { align: 'right' });

  autoTable(doc, {
    startY: 27,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 2: { fontStyle: 'bold', cellWidth: 26 } },
    body: [
      ['Supplier', intake.supplier_name || '-', 'Received', day(intake.started_at)],
      ['Supplier GSTIN', intake.supplier_gstin || '-', 'Invoice no.', intake.invoice_no || '-'],
      ['Invoice date', day(intake.invoice_date), 'Closed', day(intake.closed_at)],
    ],
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: [['#', 'Item', 'HSN', 'Batch', 'MFD', 'EXP', 'Pack', 'Qty', 'Rate', 'Taxable', 'GST', 'Total']],
    body: (intake.lines || []).map((line, index) => [
      index + 1,
      line.sku_name,
      line.hsn_code || '-',
      line.batch_no || '-',
      day(line.mfg_date),
      day(line.expiry_date),
      line.pack_type === 'carton' ? `${num(line.packs)} x ${num(line.units_per_pack)}` : 'Loose',
      num(line.qty_units),
      rs(line.unit_cost),
      rs(line.taxable_value),
      `${num(line.gst_rate)}%`,
      rs(line.line_total),
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.3, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND, fontSize: 7.5 },
    // Twelve columns on A4 portrait: autoTable's own fitting beats any width
    // list pinned here, so only the row number and the money alignment are set.
    columnStyles: {
      0: { cellWidth: 7 },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
      11: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // The rate-wise breakup and the totals sit side by side under the lines.
  const footerTop = doc.lastAutoTable.finalY + 6;
  let y = footerTop;

  if (breakup.length) {
    autoTable(doc, {
      startY: footerTop,
      // A supplier in another state is IGST at the full rate, with nothing to
      // split between CGST and SGST.
      head: [
        interstate
          ? ['GST rate', 'Taxable value', 'IGST', 'Total']
          : ['GST rate', 'Taxable value', 'CGST', 'SGST', 'Total'],
      ],
      body: breakup.map((row) =>
        interstate
          ? [`${num(row.rate)}%`, rs(row.taxable_value), rs(row.igst), rs(row.total)]
          : [
              `${num(row.rate)}%`,
              rs(row.taxable_value),
              rs(row.cgst),
              rs(row.sgst),
              rs(row.total),
            ],
      ),
      styles: { fontSize: 8, cellPadding: 1.8, halign: 'right' },
      headStyles: { fillColor: [95, 99, 104], halign: 'right' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
      tableWidth: 110,
      margin: { left: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  autoTable(doc, {
    startY: footerTop,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 1: { halign: 'right', cellWidth: 32 } },
    body: [
      ['Lines', String(totals.line_count)],
      ['Units received', num(totals.total_units)],
      ['Taxable value', rs(totals.taxable_value)],
      ['GST', rs(totals.gst_amount)],
      ['Grand total', rs(totals.grand_total)],
    ],
    margin: { left: pageWidth - 80 },
  });

  y = Math.max(y, doc.lastAutoTable.finalY) + 8;
  doc.setFontSize(7.5);
  doc.setTextColor(95, 99, 104);
  if (!gstReady) {
    const why = !store?.gstin
      ? 'No GSTIN is saved on this store, so this is a stock record only, not an input-tax claim. Add one under Account.'
      : 'No GST was recorded against these items, so this is a stock record only, not an input-tax claim.';
    doc.text(doc.splitTextToSize(why, pageWidth - 28), 14, y);
    y += 8;
  }
  if (assumedBasis && (totals.gst_amount || 0) > 0) {
    const assumed =
      'Tax is split as CGST and SGST on the assumption of a local supplier. Record the ' +
      "supplier's GSTIN to determine this from their state code.";
    doc.text(doc.splitTextToSize(assumed, pageWidth - 28), 14, y);
    y += 8;
  }
  doc.text(
    `Generated by Vendor360 on ${new Date(summary.generated_at || Date.now()).toLocaleString('en-IN')}. ` +
      'Quantities are what was counted at the counter.',
    14,
    y,
  );

  return doc;
}

export function saveIntakePdf(summary) {
  buildIntakePdf(summary).save(intakeFileName(summary));
}
