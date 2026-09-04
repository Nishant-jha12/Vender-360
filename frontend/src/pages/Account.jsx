import { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Store, Phone, Save, Edit3, Loader2, Package, ShieldCheck, Hash, LogOut, Globe } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Account() {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', store_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      const vendorId = authData?.vendor_id;
      const res = await axios.get(`http://127.0.0.1:8000/api/vendor/${vendorId}`);
      setProfile(res.data);
      setFormData({
        name: res.data.name,
        store_name: res.data.store_name,
        phone: res.data.phone
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      const vendorId = authData?.vendor_id;
      await axios.put(`http://127.0.0.1:8000/api/vendor/${vendorId}`, formData);
      setProfile({ ...profile, ...formData });
      setIsEditing(false);
      alert('Profile updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vendor_auth');
    sessionStorage.removeItem('vendor_auth');
    navigate('/auth');
  };

  const changeLanguage = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('vendor_lang', lang);
  };

  if (loading) {
    return <p className="text-center text-brand-muted py-10 animate-pulse">Loading profile...</p>;
  }

  if (!profile) {
    return <p className="text-center text-brand-danger py-10">Error loading profile.</p>;
  }

  return (
    <div className="space-y-6 pb-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-brand-ink">{t('account.title')}</h2>
          <p className="text-xs text-brand-muted">Manage your store details</p>
        </div>
        {!isEditing && (
          <button 
            onClick={() => setIsEditing(true)} 
            className="flex items-center space-x-1 text-xs bg-brand-teal/10 text-brand-teal font-semibold px-3 py-1.5 rounded-lg active:opacity-80 transition-colors"
          >
            <Edit3 size={14} />
            <span>Edit</span>
          </button>
        )}
      </div>

      <div className="bg-brand-surface rounded-xl border border-brand-border shadow-sm overflow-hidden transition-colors">
        <div className="p-6 flex flex-col items-center border-b border-brand-border bg-brand-bg/50 relative">
          <div className="w-20 h-20 rounded-full bg-brand-teal text-white flex items-center justify-center text-2xl font-bold shadow-md mb-3">
            {profile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
          </div>
          {!isEditing ? (
            <>
              <h3 className="text-lg font-bold text-brand-ink">{profile.name}</h3>
              <p className="text-sm text-brand-muted">{profile.store_name}</p>
              <div className="mt-3 bg-brand-surface border border-brand-teal text-brand-teal text-[10px] font-bold px-3 py-1 rounded-full flex items-center shadow-sm">
                <Hash size={12} className="mr-1" /> VENDOR ID: {profile.vendor_code}
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-brand-teal">Edit Profile Information</p>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider flex items-center">
              <User size={12} className="mr-1" /> Owner Name
            </label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            ) : (
              <p className="text-sm font-medium text-brand-ink">{profile.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider flex items-center">
              <Store size={12} className="mr-1" /> Store Name
            </label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.store_name}
                onChange={e => setFormData({...formData, store_name: e.target.value})}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            ) : (
              <p className="text-sm font-medium text-brand-ink">{profile.store_name}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider flex items-center">
              <Phone size={12} className="mr-1" /> Phone Number
            </label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-brand-ink text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            ) : (
              <p className="text-sm font-medium text-brand-ink">{profile.phone}</p>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="p-4 bg-brand-bg border-t border-brand-border flex space-x-3">
            <button 
              onClick={() => {
                setIsEditing(false);
                setFormData({ name: profile.name, store_name: profile.store_name, phone: profile.phone });
              }}
              className="flex-1 py-2 px-4 rounded-xl border border-brand-border text-brand-ink font-semibold bg-brand-surface active:opacity-80 transition-all text-sm"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 px-4 rounded-xl bg-brand-teal text-white font-semibold flex items-center justify-center space-x-2 active:bg-brand-teal-dark shadow-sm transition-colors text-sm disabled:opacity-70"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Language Preferences */}
      <div className="bg-brand-surface rounded-xl border border-brand-border shadow-sm p-4 transition-colors">
        <h3 className="text-sm font-bold text-brand-ink flex items-center mb-3">
          <Globe size={16} className="mr-2 text-brand-muted" />
          {t('account.language')}
        </h3>
        <select 
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal font-semibold"
        >
          <option value="en">English</option>
          <option value="hi">हिंदी (Hindi)</option>
          <option value="mr">मराठी (Marathi)</option>
        </select>
      </div>

      <h3 className="text-sm font-bold text-brand-ink mt-6 mb-2">Business Summary</h3>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/app/stock" className="bg-brand-surface border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center mb-2">
            <Package size={20} />
          </div>
          <span className="text-2xl font-bold font-poppins text-brand-ink">{profile.total_items}</span>
          <span className="text-[10px] uppercase font-semibold text-brand-muted tracking-wider mt-1">Products Listed</span>
        </Link>
        <Link to="/app/score" className="bg-brand-surface border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-full bg-brand-amber/10 text-brand-amber flex items-center justify-center mb-2">
            <ShieldCheck size={20} />
          </div>
          <span className="text-2xl font-bold font-poppins text-brand-ink">78</span>
          <span className="text-[10px] uppercase font-semibold text-brand-muted tracking-wider mt-1">Health Score</span>
        </Link>
      </div>

      <button 
        onClick={handleLogout}
        className="w-full py-4 rounded-xl border border-brand-danger/30 bg-brand-danger/10 text-brand-danger font-bold flex items-center justify-center space-x-2 hover:bg-brand-danger/20 transition-colors"
      >
        <LogOut size={18} />
        <span>{t('account.logout')}</span>
      </button>

    </div>
  );
}
