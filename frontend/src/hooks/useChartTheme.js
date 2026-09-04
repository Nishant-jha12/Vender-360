import { useEffect, useState } from 'react';

/**
 * Reads the brand CSS variables so charts follow the theme.
 *
 * Chart colours were hardcoded hex (#e5e7eb grid, #9ca3af labels), which left
 * the axes almost invisible in dark mode. A MutationObserver on the root class
 * picks up the theme toggle without a page reload.
 */
function readToken(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Tokens are stored as "R G B" for Tailwind's <alpha-value> support.
  return value ? `rgb(${value.split(/\s+/).join(', ')})` : fallback;
}

function snapshot() {
  return {
    primary: readToken('--brand-primary', '#1a73e8'),
    amber: readToken('--brand-amber', '#f9ab00'),
    danger: readToken('--brand-danger', '#d93025'),
    success: readToken('--brand-success', '#188038'),
    border: readToken('--brand-border', '#dadce0'),
    muted: readToken('--brand-muted', '#5f6368'),
    surface: readToken('--brand-surface', '#ffffff'),
    ink: readToken('--brand-ink', '#202124'),
  };
}

export function useChartTheme() {
  const [colors, setColors] = useState(snapshot);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(snapshot()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
