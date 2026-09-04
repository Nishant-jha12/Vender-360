// Indian digit grouping: 1,45,000 rather than 145,000.
const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** ₹66 for round amounts, ₹1,45,000.50 when there are paise. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return Number.isInteger(n) ? inrWhole.format(n) : inrPaise.format(n);
}

/** ₹1,45,000 — for headline figures where paise are noise. */
export function moneyWhole(value) {
  const n = Number(value);
  return Number.isFinite(n) ? inrWhole.format(n) : '₹0';
}

/** Drops trailing zeros: 2.5 -> "2.5", 3.0 -> "3" */
export function qty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
