import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Database, FileText, Globe, Hash, Loader2, LogOut, Moon, Package, Play, Save, ShieldCheck, Smartphone,
  Store, Sun, User, Volume2, VolumeX,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSoundbox } from '../context/SoundboxContext';
import { useToast } from '../components/Toast';
import { CardSkeleton, ErrorState } from '../components/States';
import { useApi } from '../hooks/useApi';
import SecurityLog from '../components/SecurityLog';
import { LANGUAGES } from '../i18n';

export default function Account() {
  const { t, i18n } = useTranslation();
  const { logout, refreshVendor } = useAuth();
  const { isDark, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const { data: profile, loading, error, reload, setData } = useApi('/vendor/me');
  const health = useApi('/analytics/health-score');

  const {
    enabled: soundboxEnabled,
    setEnabled: setSoundboxEnabled,
    lang: soundboxLang,
    setLang: setSoundboxLang,
    volume: soundboxVolume,
    setVolume: setSoundboxVolume,
    testVoice: testSoundboxVoice,
  } = useSoundbox();
  const [testingVoice, setTestingVoice] = useState(false);

  const handleTestVoice = async () => {
    if (testingVoice) return;
    setTestingVoice(true);
    try {
      await testSoundboxVoice(150, soundboxLang);
    } catch {
      // test fallback
    } finally {
      setTestingVoice(false);
    }
  };

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', store_name: '', phone: '', upi_id: '', gstin: '' });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        store_name: profile.store_name || '',
        phone: profile.phone || '',
        upi_id: profile.upi_id || '',
        gstin: profile.gstin || '',
      });
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/vendor/me', {
        name: form.name,
        store_name: form.store_name,
        phone: form.phone || null,
        upi_id: form.upi_id || null,
        gstin: form.gstin || null,
      });
      setData(res.data);
      await refreshVendor();
      setEditing(false);
      toast.success('Profile saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const loadSampleData = async () => {
    if (!window.confirm('This replaces your current products, customers and sales with a sample catalogue and 30 days of history. Continue?')) return;
    setSeeding(true);
    try {
      const res = await api.post('/demo/seed');
      toast.success(`Loaded ${res.data.products} products and ${res.data.sales} sales`);
      reload();
      health.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSeeding(false);
    }
  };

  const changeLanguage = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('vendor_lang', lang);
  };

  if (loading) return <CardSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!profile) return null;

  const initials = (profile.name || '?')
    .split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="space-y-5 pb-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-brand-ink font-inter">{t('account.title')}</h2>
          <p className="text-xs text-brand-muted">Your store details and settings</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs bg-brand-primary/10 text-brand-primary font-bold px-4 py-2 rounded-2xl focus-visible:ring-2 focus-visible:ring-brand-primary outline-none">
            Edit
          </button>
        )}
      </div>

      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm overflow-hidden">
        <div className="p-6 flex flex-col items-center border-b border-brand-border bg-brand-bg/50">
          <div className="w-20 h-20 rounded-full bg-brand-primary text-brand-on-primary flex items-center justify-center text-2xl font-bold shadow-md mb-3">
            {initials}
          </div>
          <h3 className="text-lg font-bold text-brand-ink">{profile.name}</h3>
          <p className="text-sm text-brand-muted">{profile.store_name}</p>
          {profile.vendor_code && (
            <div className="mt-3 bg-brand-surface border border-brand-primary text-brand-primary text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <Hash size={12} /> {profile.vendor_code}
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          <Row icon={User} label="Owner name" editing={editing} value={profile.name}
               input={<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />} />
          <Row icon={Store} label="Store name" editing={editing} value={profile.store_name}
               input={<input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} className={inputClass} />} />
          <Row icon={Smartphone} label="Phone" editing={editing} value={profile.phone || 'Not set'}
               input={<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+91 98765 43210" />} />

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={12} /> Your UPI ID
            </label>
            {editing ? (
              <input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} className={inputClass} placeholder="yourname@okaxis" />
            ) : (
              <p className={`text-sm font-medium ${profile.upi_id ? 'text-brand-ink' : 'text-brand-danger'}`}>
                {profile.upi_id || 'Not set — UPI checkout is disabled until you add this'}
              </p>
            )}
            <p className="text-[11px] text-brand-muted leading-relaxed">
              Every QR you generate collects payment to this ID, so make sure it is your own.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={12} /> GSTIN
            </label>
            {editing ? (
              <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className={`${inputClass} font-mono`} placeholder="27AAPFU0939F1ZV" maxLength={15} />
            ) : (
              <p className="text-sm font-medium text-brand-ink">{profile.gstin || 'Not set'}</p>
            )}
            <p className="text-[11px] text-brand-muted leading-relaxed">
              Printed on stock-intake summaries. Without it they are stock records rather than
              input-tax claims.
            </p>
          </div>
        </div>

        {editing && (
          <div className="p-4 bg-brand-bg border-t border-brand-border flex gap-3">
            <button
              onClick={() => {
                setEditing(false);
                setForm({
                  name: profile.name, store_name: profile.store_name,
                  phone: profile.phone || '', upi_id: profile.upi_id || '',
                  gstin: profile.gstin || '',
                });
              }}
              className="flex-1 py-2.5 rounded-2xl border border-brand-border text-brand-ink font-semibold bg-brand-surface text-sm"
            >
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-2xl bg-brand-primary text-brand-on-primary font-semibold flex items-center justify-center gap-2 text-sm disabled:opacity-70">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save changes
            </button>
          </div>
        )}
      </div>

      <SecurityLog
        onSignedOutEverywhere={() => {
          // The token this tab holds was just revoked along with the rest.
          logout();
          navigate('/auth', { replace: true });
        }}
      />

      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm p-4">
        <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2 mb-3">
          <Globe size={16} className="text-brand-muted" /> {t('account.language')}
        </h3>
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          aria-label={t('account.language')}
          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-ink font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          {/* Driven off the shared list, so adding a language in i18n.js
              cannot leave this switcher behind. */}
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </div>

      {/* Theme Preference */}
      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm p-4">
        <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2 mb-3">
          {isDark ? <Moon size={16} className="text-brand-primary" /> : <Sun size={16} className="text-amber-500" />}
          {t('theme.theme_label')}
        </h3>
        <div className="grid grid-cols-2 gap-2 bg-brand-bg p-1 rounded-xl border border-brand-border">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              !isDark
                ? 'bg-brand-surface text-brand-ink shadow-sm border border-brand-border/60'
                : 'text-brand-muted hover:text-brand-ink'
            }`}
          >
            <Sun size={15} className="text-amber-500" />
            <span>{t('theme.light')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              isDark
                ? 'bg-brand-surface text-brand-primary shadow-sm border border-brand-border/60'
                : 'text-brand-muted hover:text-brand-ink'
            }`}
          >
            <Moon size={15} className="text-brand-primary" />
            <span>{t('theme.dark')}</span>
          </button>
        </div>
      </div>

      {/* Soundbox Configuration */}
      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2">
            <Volume2 size={16} className="text-brand-primary" />
            {t('soundbox.title', 'UPI Voice Soundbox')}
          </h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={soundboxEnabled}
              onChange={(e) => setSoundboxEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
          </label>
        </div>

        <p className="text-xs text-brand-muted leading-relaxed mb-3">
          {t('soundbox.description', 'Plays electronic chime and announces payment received in your regional language instantly upon UPI confirmation.')}
        </p>

        {soundboxEnabled && (
          <div className="space-y-3.5 pt-3 border-t border-brand-border/60">
            <div>
              <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider block mb-1.5">
                {t('soundbox.language_label', 'Announcement Language')}
              </label>
              <select
                value={soundboxLang}
                onChange={(e) => setSoundboxLang(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-brand-ink font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="hi-IN">हिंदी (Hindi) - "वेंडर 360 पर 150 रुपये प्राप्त हुए"</option>
                <option value="mr-IN">मराठी (Marathi) - "वेंडर 360 वर 150 रुपये प्राप्त झाले"</option>
                <option value="bn-IN">বাংলা (Bengali) - "ভেন্ডার 360-এ 150 টাকা পাওয়া গেছে"</option>
                <option value="en-IN">English (Indian) - "Received 150 rupees on Vendor 360"</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                <span>{t('soundbox.volume_label', 'Soundbox Volume')}</span>
                <span className="font-mono text-brand-ink">{Math.round(soundboxVolume * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                {soundboxVolume === 0 ? (
                  <VolumeX size={15} className="text-brand-muted" />
                ) : (
                  <Volume2 size={15} className="text-brand-primary" />
                )}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundboxVolume}
                  onChange={(e) => setSoundboxVolume(parseFloat(e.target.value))}
                  className="w-full accent-brand-primary h-1.5 bg-brand-border rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestVoice}
              disabled={testingVoice}
              className="w-full mt-1 py-2.5 px-3 rounded-xl border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {testingVoice ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t('soundbox.testing', 'Playing chime & voice...')}</span>
                </>
              ) : (
                <>
                  <Play size={14} className="fill-brand-primary" />
                  <span>{t('soundbox.test_button', '🔊 Test Soundbox Voice (₹150)')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/app/stock" className="bg-brand-surface border border-brand-border rounded-2xl p-4 flex flex-col items-center text-center shadow-sm active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-brand-primary outline-none">
          <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-2">
            <Package size={20} />
          </div>
          <span className="text-2xl font-bold font-inter text-brand-ink">{profile.total_items}</span>
          <span className="text-[10px] uppercase font-bold text-brand-muted tracking-wider mt-1">Products</span>
        </Link>
        <Link to="/app/score" className="bg-brand-surface border border-brand-border rounded-2xl p-4 flex flex-col items-center text-center shadow-sm active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-brand-primary outline-none">
          <div className="w-10 h-10 rounded-full bg-brand-amber/10 text-brand-amber flex items-center justify-center mb-2">
            <ShieldCheck size={20} />
          </div>
          <span className="text-2xl font-bold font-inter text-brand-ink">
            {health.data?.has_data ? health.data.health_score : '—'}
          </span>
          <span className="text-[10px] uppercase font-bold text-brand-muted tracking-wider mt-1">Health score</span>
        </Link>
      </div>

      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm p-4">
        <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2 mb-1.5">
          <Database size={16} className="text-brand-muted" /> Sample data
        </h3>
        <p className="text-xs text-brand-muted leading-relaxed mb-3">
          Loads a kirana catalogue, four khata customers and 30 days of billing
          history. The history is synthetic, but every figure the app shows is
          then computed from those real rows.
        </p>
        <button onClick={loadSampleData} disabled={seeding} className="text-xs bg-brand-bg border border-brand-border px-4 py-2.5 rounded-2xl font-bold text-brand-ink hover:bg-brand-border/30 transition-colors flex items-center gap-2 disabled:opacity-60">
          {seeding && <Loader2 size={14} className="animate-spin" />}
          {seeding ? 'Loading...' : 'Load sample data'}
        </button>
      </div>

      <button
        onClick={() => {
          logout();
          navigate('/auth', { replace: true });
        }}
        className="w-full py-4 rounded-2xl border border-brand-danger/30 bg-brand-danger/10 text-brand-danger font-bold flex items-center justify-center gap-2 hover:bg-brand-danger/20 transition-colors focus-visible:ring-2 focus-visible:ring-brand-danger outline-none"
      >
        <LogOut size={18} /> {t('account.logout')}
      </button>
    </div>
  );
}

const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary';

function Row({ icon: Icon, label, value, editing, input }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </label>
      {editing ? input : <p className="text-sm font-medium text-brand-ink">{value}</p>}
    </div>
  );
}
