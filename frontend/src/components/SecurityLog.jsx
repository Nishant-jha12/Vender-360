import { useState } from 'react';
import { AlertTriangle, Check, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { useToast } from './Toast';

/**
 * "Was that me?"
 *
 * A sign-in from a device the shopkeeper does not recognise is, for most
 * people, the only warning they will ever get that a password has leaked -- and
 * it is worth nothing unless somebody can see it. So this shows failures as
 * loudly as successes, names the device in words rather than a user-agent
 * string, and puts the sign-out-everywhere button right underneath, because the
 * moment you spot a stranger is the moment you want it.
 *
 * The server sends a stable event key (`login.failed`) as well as its own
 * English wording. The key is translated here; the server's words are the
 * fallback, so a server that learns a new event still reads sensibly in a
 * client that has not been updated yet.
 */
export default function SecurityLog({ onSignedOutEverywhere }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/auth/security-log', { params: { limit: 50 } });

  const [expanded, setExpanded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const rows = data || [];
  const shown = expanded ? rows : rows.slice(0, 6);
  const refused = rows.filter((row) => row.outcome === 'denied').length;

  const signOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await api.post('/auth/logout-all');
      // Every token for this account is now dead, including this tab's.
      toast.success(t('account.signed_out_everywhere'));
      onSignedOutEverywhere?.();
    } catch (err) {
      toast.error(errorMessage(err));
      setSigningOut(false);
    }
  };

  return (
    <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm p-4">
      <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2 mb-1.5">
        <ShieldAlert size={16} className="text-brand-muted" /> {t('account.security_activity')}
      </h3>
      <p className="text-xs text-brand-muted leading-relaxed mb-3">
        {t('account.security_activity_hint')}
      </p>

      {loading && <p className="text-xs text-brand-muted">{t('common.loading')}</p>}

      {error && (
        <div className="text-xs text-brand-danger flex items-center gap-2">
          {error}
          <button onClick={reload} className="underline font-semibold">
            {t('common.try_again')}
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-xs text-brand-muted">{t('account.security_activity_empty')}</p>
      )}

      {rows.length > 0 && (
        <>
          {refused > 0 && (
            <p className="text-[11px] font-semibold text-brand-amber flex items-center gap-1.5 mb-2">
              <AlertTriangle size={12} />
              {t('account.security_refused', { count: refused })}
            </p>
          )}

          <ul className="divide-y divide-brand-border">
            {shown.map((row) => (
              <li key={row.id} className="py-2 flex items-start gap-2.5">
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    row.outcome === 'denied'
                      ? 'bg-brand-danger/10 text-brand-danger'
                      : 'bg-brand-primary/10 text-brand-primary'
                  }`}
                  aria-hidden="true"
                >
                  {row.outcome === 'denied' ? <AlertTriangle size={11} /> : <Check size={11} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-brand-ink">
                    {t(`security_event.${row.event}`, { defaultValue: row.description })}
                  </p>
                  <p className="text-[11px] text-brand-muted truncate">
                    {row.device}
                    {row.ip ? ` · ${row.ip}` : ''}
                    {row.detail ? ` · ${row.detail}` : ''}
                  </p>
                </div>
                <span className="text-[10px] text-brand-muted shrink-0 pt-0.5">
                  {relativeTime(row.at)}
                </span>
              </li>
            ))}
          </ul>

          {rows.length > 6 && (
            <button
              onClick={() => setExpanded((open) => !open)}
              className="mt-2 text-xs font-bold text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded"
            >
              {expanded
                ? t('common.show_less')
                : t('account.security_show_all', { count: rows.length })}
            </button>
          )}
        </>
      )}

      <button
        onClick={signOutEverywhere}
        disabled={signingOut}
        className="mt-3 w-full text-xs bg-brand-bg border border-brand-border px-4 py-2.5 rounded-2xl font-bold text-brand-ink hover:bg-brand-border/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
      >
        {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
        {t('account.sign_out_everywhere')}
      </button>
      <p className="text-[11px] text-brand-muted leading-relaxed mt-1.5">
        {t('account.sign_out_everywhere_hint')}
      </p>
    </div>
  );
}
