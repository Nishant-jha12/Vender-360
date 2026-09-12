import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/Toast';

export default function Auth() {
  const { i18n } = useTranslation();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [mode, setMode] = useState('login'); // login | signup | otp | forgot | reset
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // Signed proof that the password step just succeeded, and the only thing the
  // OTP step will accept. Held in memory alone -- it is short-lived and has no
  // business outliving the tab.
  const [challengeToken, setChallengeToken] = useState(null);
  const [debugOtp, setDebugOtp] = useState(null);

  const [form, setForm] = useState({
    name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', otp: '',
  });
  // A reset link arrives as ?token=... -- landing on it opens the reset form.
  const [resetToken, setResetToken] = useState(null);

  const navigate = useNavigate();
  const toast = useToast();
  const { login, isAuthenticated } = useAuth();

  useEffect(() => {
    // Staying signed in is the sane default on a shop's own phone.
    setRememberMe(window.innerWidth < 768);

    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      setResetToken(token);
      setMode('reset');
      // Keep the token out of the address bar, history and any Referer header.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const requestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { identifier: form.username });
      // Deliberately the same answer whether or not the account exists.
      toast.success(res.data.message);
      setMode('login');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('The two passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        reset_token: resetToken, new_password: form.password,
      });
      toast.success('Password changed. Sign in with the new one.');
      setResetToken(null);
      setMode('login');
    } catch (err) {
      toast.error(errorMessage(err, 'That reset link is no longer valid'));
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) return <Navigate to="/app" replace />;

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSignup = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('The two passwords do not match');
      return;
    }
    if (form.password.length < 10) {
      toast.error('Use at least 10 characters for your password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        name: form.name, username: form.username, email: form.email,
        phone: form.phone, password: form.password,
      });
      setChallengeToken(res.data.challenge_token);
      setDebugOtp(res.data.debug_otp || null);
      setMode('otp');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the account'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        identifier: form.username,
        password: form.password,
      });
      setChallengeToken(res.data.challenge_token);
      setDebugOtp(res.data.debug_otp || null);
      setMode('otp');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not sign in'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        challenge_token: challengeToken,
        otp: form.otp,
      });
      login(res.data, rememberMe);
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'That code was not accepted'));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const res = await api.post('/auth/resend-otp', { challenge_token: challengeToken });
      // A resend mints a fresh challenge; the old one is replaced.
      setChallengeToken(res.data.challenge_token);
      setDebugOtp(res.data.debug_otp || null);
      toast.success('A new code has been sent');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const headings = {
    login: ['Welcome back', 'Sign in to your store'],
    signup: ['Create your account', 'Set up your store on Vendor360'],
    otp: ['Verify it is you', 'Enter the 6-digit code'],
    forgot: ['Reset your password', 'We will send you a reset link'],
    reset: ['Choose a new password', 'At least 10 characters'],
  };
  const [title, subtitle] = headings[mode];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-neutral-950 flex flex-col items-center justify-center p-0 md:py-6 selection:bg-brand-primary selection:text-white font-roboto antialiased">
      <div className="w-full max-w-md h-screen md:h-auto md:min-h-[640px] md:rounded-[36px] bg-brand-surface border-0 md:border md:border-brand-border/80 shadow-2xl overflow-hidden flex flex-col justify-between">
        <div>
          {/* Mobile App Header */}
          <div className="bg-brand-primary text-brand-on-primary p-5 text-center relative shrink-0">
            {(mode === 'otp' || mode === 'forgot' || mode === 'reset') && (
              <button
                onClick={() => setMode('login')}
                aria-label="Go back"
                className="absolute left-4 top-5 opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-white rounded-full p-1 outline-none"
              >
                <ArrowLeft size={22} />
              </button>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="absolute right-4 top-5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all outline-none"
            >
              {isDark ? <Sun size={17} className="text-amber-300" /> : <Moon size={17} />}
            </button>

            {/* Language Switcher Pill */}
            <div className="flex justify-center gap-1.5 mb-2.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage(l.code);
                    localStorage.setItem('vendor_lang', l.code);
                  }}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                    i18n.language === l.code
                      ? 'bg-white text-brand-primary shadow-sm'
                      : 'bg-white/20 text-white/90 hover:bg-white/30'
                  }`}
                >
                  {l.code === 'en' ? 'English' : l.code === 'hi' ? 'हिंदी' : l.code === 'mr' ? 'मराठी' : 'বাংলা'}
                </button>
              ))}
            </div>

            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-2 border border-white/30 shadow-sm font-inter font-bold text-xl">
              V
            </div>
            <h1 className="text-xl font-bold font-inter">{title}</h1>
            <p className="opacity-85 text-xs mt-0.5">{subtitle}</p>
          </div>

          <div className="p-6">
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <Field label="Username or email">
                  <input name="username" required value={form.username} onChange={set} autoComplete="username" className={inputClass} placeholder="Enter username or email" />
                </Field>

                <Field
                  label="Password"
                  action={
                    <button type="button" onClick={() => setMode('forgot')} className="text-xs font-bold text-brand-primary hover:underline">
                      Forgot?
                    </button>
                  }
                >
                  <div className="relative">
                    <input
                      name="password" type={showPassword ? 'text' : 'password'} required
                      value={form.password} onChange={set} autoComplete="current-password"
                      className={`${inputClass} pr-10`} placeholder="Your password"
                    />
                    <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                  </div>
                </Field>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary" />
                  <span className="text-sm text-brand-ink font-medium">Keep me signed in on this device</span>
                </label>

                <SubmitButton loading={loading}>Sign in</SubmitButton>

                <p className="text-center text-sm text-brand-muted">
                  New here?{' '}
                  <button type="button" onClick={() => setMode('signup')} className="font-bold text-brand-primary hover:underline">
                    Create an account
                  </button>
                </p>
              </form>
            )}

            {mode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Your name"><input name="name" required value={form.name} onChange={set} className={inputClass} placeholder="Rakesh Sharma" /></Field>
                  <Field label="Username"><input name="username" required minLength={3} value={form.username} onChange={set} className={inputClass} placeholder="rakesh_store" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email"><input name="email" type="email" required value={form.email} onChange={set} className={inputClass} placeholder="you@example.com" /></Field>
                  <Field label="Phone"><input name="phone" required value={form.phone} onChange={set} className={inputClass} placeholder="+91 98765 43210" /></Field>
                </div>
                <Field label="Password">
                  <div className="relative">
                    <input name="password" type={showPassword ? 'text' : 'password'} required minLength={8} value={form.password} onChange={set} autoComplete="new-password" className={`${inputClass} pr-10`} placeholder="At least 8 characters" />
                    <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                  </div>
                </Field>
                <Field label="Confirm password">
                  <input name="confirmPassword" type="password" required value={form.confirmPassword} onChange={set} autoComplete="new-password" className={inputClass} />
                </Field>

                <SubmitButton loading={loading}>Create account</SubmitButton>

                <p className="text-center text-sm text-brand-muted">
                  Already registered?{' '}
                  <button type="button" onClick={() => setMode('login')} className="font-bold text-brand-primary hover:underline">
                    Sign in
                  </button>
                </p>
              </form>
            )}

            {mode === 'otp' && (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="bg-brand-bg p-4 rounded-2xl border border-brand-border text-center">
                  <p className="text-sm text-brand-ink">
                    We sent a 6-digit code to your registered phone.
                  </p>
                  {debugOtp && (
                    <p className="text-xs text-brand-amber font-bold mt-2">
                      No SMS provider is connected yet — your code is {debugOtp}
                    </p>
                  )}
                </div>

                <Field label="Verification code">
                  <input
                    name="otp" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                    value={form.otp} onChange={set} autoComplete="one-time-code"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-center tracking-[0.5em] font-bold text-xl text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    placeholder="------"
                  />
                </Field>

                <button type="submit" disabled={loading || form.otp.length !== 6} className="w-full bg-brand-primary text-brand-on-primary font-bold py-3 rounded-2xl shadow-md hover:bg-brand-primary-dark active:scale-[0.98] transition-all flex justify-center items-center disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify and continue'}
                </button>

                <button type="button" onClick={resend} className="w-full text-xs font-bold text-brand-primary hover:underline">
                  Send a new code
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={requestReset} className="space-y-4">
                <label className="block">
                  <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                    Username or email
                  </span>
                  <input
                    required
                    name="username"
                    value={form.username}
                    onChange={set}
                    autoComplete="username"
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    placeholder="Enter username or email"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading || !form.username.trim()}
                  className="w-full bg-brand-primary text-brand-on-primary font-bold py-3 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />} Send the reset link
                </button>
                <button type="button" onClick={() => setMode('login')} className="w-full bg-brand-bg border border-brand-border text-brand-ink font-bold py-3 rounded-2xl">
                  Back to sign in
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={submitReset} className="space-y-4">
                <label className="block">
                  <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                    New password
                  </span>
                  <input
                    required
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={set}
                    autoComplete="new-password"
                    minLength={10}
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    placeholder="At least 10 characters"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                    Confirm new password
                  </span>
                  <input
                    required
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={set}
                    autoComplete="new-password"
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </label>
                <p className="text-[11px] text-brand-muted">
                  Changing your password signs you out everywhere else.
                </p>
                <button
                  type="submit"
                  disabled={loading || form.password.length < 10}
                  className="w-full bg-brand-primary text-brand-on-primary font-bold py-3 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />} Set the new password
                </button>
              </form>
            )}
          </div>
        </div>

        {/* In-App Legal Footer */}
        <div className="p-3.5 border-t border-brand-border/40 text-center bg-brand-bg/50 shrink-0">
          <p className="text-[11px] text-brand-muted">
            Vendor360 Kirana App •{' '}
            <Link to="/legal" className="text-brand-primary font-semibold hover:underline">
              Terms & Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-primary';

function Field({ label, children, action }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function PasswordToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="absolute right-3 top-3 text-brand-muted hover:text-brand-ink focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded"
    >
      {shown ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );
}

function SubmitButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full mt-2 bg-brand-primary text-brand-on-primary font-bold py-3 rounded-2xl shadow-md hover:bg-brand-primary-dark active:scale-[0.98] transition-all flex justify-center items-center disabled:opacity-60"
    >
      {loading ? <Loader2 className="animate-spin" size={20} /> : children}
    </button>
  );
}
