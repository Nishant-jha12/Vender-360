import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function Auth() {
  const [mode, setMode] = useState('login'); // login | signup | otp | forgot
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingVendorId, setPendingVendorId] = useState(null);
  const [debugOtp, setDebugOtp] = useState(null);

  const [form, setForm] = useState({
    name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', otp: '',
  });

  const navigate = useNavigate();
  const toast = useToast();
  const { login, isAuthenticated } = useAuth();

  useEffect(() => {
    // Staying signed in is the sane default on a shop's own phone.
    setRememberMe(window.innerWidth < 768);
  }, []);

  if (isAuthenticated) return <Navigate to="/app" replace />;

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSignup = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('The two passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Use at least 8 characters for your password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        name: form.name, username: form.username, email: form.email,
        phone: form.phone, password: form.password,
      });
      setPendingVendorId(res.data.vendor_id);
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
      setPendingVendorId(res.data.vendor_id);
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
        vendor_id: pendingVendorId,
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
      const res = await api.post('/auth/resend-otp', { vendor_id: pendingVendorId, otp: '000000' });
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
  };
  const [title, subtitle] = headings[mode];

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center mb-4 text-sm font-bold text-brand-muted hover:text-brand-ink">
          ← Back to home
        </Link>

        <div className="bg-brand-surface border border-brand-border rounded-3xl shadow-xl overflow-hidden">
          <div className="bg-brand-primary text-brand-on-primary p-6 text-center relative">
            {(mode === 'otp' || mode === 'forgot') && (
              <button
                onClick={() => setMode('login')}
                aria-label="Go back"
                className="absolute left-4 top-6 opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-white rounded outline-none"
              >
                <ArrowLeft size={22} />
              </button>
            )}
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <Lock size={22} />
            </div>
            <h1 className="text-2xl font-bold font-inter">{title}</h1>
            <p className="opacity-80 text-sm mt-1">{subtitle}</p>
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
              <div className="space-y-4">
                <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-2xl p-4">
                  <p className="text-sm font-bold text-brand-ink">Not available yet</p>
                  <p className="text-xs text-brand-muted mt-1.5 leading-relaxed">
                    Password reset needs an email or SMS provider, which is not
                    connected. Rather than show a form that quietly does nothing,
                    it is disabled until that is wired up.
                  </p>
                </div>
                <button onClick={() => setMode('login')} className="w-full bg-brand-bg border border-brand-border text-brand-ink font-bold py-3 rounded-2xl">
                  Back to sign in
                </button>
              </div>
            )}
          </div>
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
