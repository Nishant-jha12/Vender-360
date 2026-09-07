import i18n from '../i18n';

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

/**
 * Parse a timestamp from the API.
 *
 * The backend stores and returns UTC with no marker -- "2026-09-06T16:48:48".
 * JavaScript reads a bare date-time like that as *local* time, so in India
 * every "x ago" in the app was five and a half hours out: a sale rung up a
 * moment ago read as "5h ago". Anything already carrying a Z or an offset is
 * left alone.
 */
export function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  // A bare date ("2026-12-31") is already parsed as UTC by every engine.
  const naiveDateTime = text.includes('T') && !/([zZ])$|[+-]\d{2}:?\d{2}$/.test(text);
  const parsed = new Date(naiveDateTime ? `${text}Z` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function shortDate(value) {
  const d = parseApiDate(value);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
}

// Built per language and reused: constructing an Intl formatter is not free,
// and this runs once per row of a list.
const relativeFormatters = new Map();

function relativeFormatter(locale) {
  if (!relativeFormatters.has(locale)) {
    // numeric:'auto' is what turns -1 day into "yesterday" -- in whichever
    // language, without us writing the word ourselves.
    relativeFormatters.set(locale, new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }));
  }
  return relativeFormatters.get(locale);
}

/**
 * "5m ago", in the shopkeeper's language.
 *
 * This used to build the English words by hand, so a Hindi or Bengali screen
 * still said "yesterday". Intl knows all four.
 */
export function relativeTime(value) {
  const then = parseApiDate(value);
  if (!then) return '';
  // Clock skew between the shop's device and the server can put a fresh row a
  // few seconds in the future; "in 3 seconds" would look like a bug.
  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  const locale = i18n.language || 'en';
  const rtf = relativeFormatter(locale);

  if (seconds < 60) return rtf.format(0, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, 'day');
  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
