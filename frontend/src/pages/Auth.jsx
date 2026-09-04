import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Eye, EyeOff, Lock, User, Mail, Phone, Loader2, ArrowLeft } from 'lucide-react';

export default function Auth() {
  const [mode, setMode] = useState('login'); // 'login', 'signup', 'otp', 'forgot'
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  // Track Vendor ID between login/signup and OTP screen
  const [tempVendorId, setTempVendorId] = useState(null);

  const navigate = useNavigate();

  // Form Data
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    otp: ''
  });

  useEffect(() => {
    // Default Remember Me to true on Mobile, false on Desktop
    setRememberMe(window.innerWidth < 768);
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/auth/signup', formData);
      setTempVendorId(res.data.vendor_id);
      setMode('otp');
    } catch (err) {
      alert(err.response?.data?.detail || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/auth/login', {
        identifier: formData.username, // using username field to store either email or username
        password: formData.password
      });
      setTempVendorId(res.data.vendor_id);
      setMode('otp');
    } catch (err) {
      alert(err.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/auth/verify-otp', {
        vendor_id: tempVendorId,
        otp: formData.otp
      });
      
      const authData = JSON.stringify({ token: res.data.token, vendor_id: res.data.vendor_id });
      
      // Save session based on Remember Me preference
      if (rememberMe) {
        localStorage.setItem('vendor_auth', authData);
      } else {
        sessionStorage.setItem('vendor_auth', authData);
      }
      
      navigate('/app');
    } catch (err) {
      alert(err.response?.data?.detail || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 transition-colors">
      <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="bg-brand-teal text-white p-6 text-center relative">
          {mode !== 'login' && mode !== 'signup' && (
            <button 
              onClick={() => setMode('login')} 
              className="absolute left-4 top-6 text-white/80 hover:text-white"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Lock size={24} />
          </div>
          <h2 className="text-2xl font-bold font-poppins">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'otp' && 'Verify Identity'}
            {mode === 'forgot' && 'Reset Password'}
          </h2>
          <p className="text-white/80 text-sm mt-1">
            {mode === 'login' && 'Log in to your Vendor360 dashboard'}
            {mode === 'signup' && 'Join the smartest B2B network'}
            {mode === 'otp' && 'Enter the 6-digit code sent to you'}
            {mode === 'forgot' && 'We will send a reset link to your email'}
          </p>
        </div>

        {/* Forms */}
        <div className="p-6">
          
          {/* LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Username or Email</label>
                <div className="relative mt-1">
                  <User size={18} className="absolute left-3 top-2.5 text-brand-muted" />
                  <input 
                    type="text" 
                    name="username"
                    required
                    value={formData.username}
                    onChange={handleInputChange}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg pl-10 pr-3 py-2 text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    placeholder="Enter username or email"
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Password</label>
                  <button type="button" onClick={() => setMode('forgot')} className="text-xs font-bold text-brand-teal hover:underline">Forgot?</button>
                </div>
                <div className="relative mt-1">
                  <Lock size={18} className="absolute left-3 top-2.5 text-brand-muted" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg pl-10 pr-10 py-2 text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    placeholder="Enter your password"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-brand-muted hover:text-brand-ink"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2 mt-2">
                <input 
                  type="checkbox" 
                  id="remember" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-brand-border text-brand-teal focus:ring-brand-teal"
                />
                <label htmlFor="remember" className="text-sm text-brand-ink font-medium">Remember me on this device</label>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full mt-4 bg-brand-teal text-white font-bold py-3 rounded-xl shadow-md hover:bg-brand-teal-dark active:scale-[0.98] transition-all flex justify-center items-center"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Login securely'}
              </button>

              <p className="text-center text-sm text-brand-muted mt-4">
                Don't have an account? <button type="button" onClick={() => setMode('signup')} className="font-bold text-brand-teal hover:underline">Sign up</button>
              </p>
            </form>
          )}

          {/* SIGNUP */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider">Full Name</label>
                  <input 
                    type="text" name="name" required value={formData.name} onChange={handleInputChange}
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider">Username</label>
                  <input 
                    type="text" name="username" required value={formData.username} onChange={handleInputChange}
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="johndoe123"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider">Email ID</label>
                  <input 
                    type="email" name="email" required value={formData.email} onChange={handleInputChange}
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider">Phone</label>
                  <input 
                    type="text" name="phone" required value={formData.phone} onChange={handleInputChange}
                    className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="+91 9999999999"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider">Set Password</label>
                <div className="relative mt-1">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    name="password" required value={formData.password} onChange={handleInputChange}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 pr-10 text-brand-ink focus:ring-2 focus:ring-brand-teal text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2 text-brand-muted">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider">Confirm Password</label>
                <input 
                  type="password" name="confirmPassword" required value={formData.confirmPassword} onChange={handleInputChange}
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink focus:ring-2 focus:ring-brand-teal text-sm"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full mt-4 bg-brand-teal text-white font-bold py-3 rounded-xl shadow-md hover:bg-brand-teal-dark active:scale-[0.98] transition-all flex justify-center items-center"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
              </button>

              <p className="text-center text-sm text-brand-muted mt-4">
                Already have an account? <button type="button" onClick={() => setMode('login')} className="font-bold text-brand-teal hover:underline">Log in</button>
              </p>
            </form>
          )}

          {/* OTP */}
          {mode === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="bg-brand-bg p-4 rounded-xl border border-brand-border text-center mb-6">
                <p className="text-sm text-brand-ink">A 6-digit code has been sent to your registered contact methods.</p>
                <p className="text-xs text-brand-teal font-bold mt-2">Prototype Hint: Use '123456'</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Enter Code</label>
                <input 
                  type="text" 
                  name="otp"
                  maxLength={6}
                  required
                  value={formData.otp}
                  onChange={handleInputChange}
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-center tracking-[0.5em] font-bold text-xl text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  placeholder="------"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading || formData.otp.length !== 6}
                className="w-full mt-4 bg-brand-teal text-white font-bold py-3 rounded-xl shadow-md hover:bg-brand-teal-dark active:scale-[0.98] transition-all flex justify-center items-center disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify & Proceed'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={(e) => { e.preventDefault(); alert("Reset link sent! (Mock)"); setMode('login'); }} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Registered Email or Phone</label>
                <input 
                  type="text" 
                  required
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  placeholder="Enter your email or phone"
                />
              </div>

              <button 
                type="submit" 
                className="w-full mt-4 bg-brand-teal text-white font-bold py-3 rounded-xl shadow-md hover:bg-brand-teal-dark active:scale-[0.98] transition-all"
              >
                Send Reset Link
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
