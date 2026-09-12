import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Bell, BookOpen, Globe, Grid, HeartPulse, Home,
  Loader2, Map as MapIcon, Mic, Moon, Package, ScanLine, ShieldCheck,
  ShoppingCart, Sun, TrendingUp, Truck, User, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import { LANGUAGES } from './i18n';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import { useApi } from './hooks/useApi';

import Legal from './pages/Legal';
import Auth from './pages/Auth';

import Account from './pages/Account';
import Billing from './pages/Billing';
import Dashboard from './pages/Dashboard';
import Forecast from './pages/Forecast';
import HealthScore from './pages/HealthScore';
import Heatmap from './pages/Heatmap';
import Inventory from './pages/Inventory';
import KhataDashboard from './pages/KhataDashboard';
import Notifications from './pages/Notifications';
import ScanReceipt from './pages/ScanReceipt';
import Intakes from './pages/Intakes';
import ErrorBoundary from './components/ErrorBoundary';
import VoiceEntry from './pages/VoiceEntry';

function ProtectedRoute({ children }) {
  const { isAuthenticated, checking } = useAuth();

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <Loader2 className="animate-spin" size={28} />
          </div>
          <p className="text-xs font-semibold text-brand-muted">Loading Vendor360 App...</p>
        </div>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
}


function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isDark, toggle } = useTheme();
  const { displayName, storeName } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const expiring = useApi('/inventory/expiring-soon', { params: { days: 7 } });
  const alertCount = expiring.data?.length || 0;

  const path = location.pathname;
  useEffect(() => {
    setMoreOpen(false);
    setLangMenuOpen(false);
  }, [path]);

  // Screen titles dictionary for native app header
  const screenTitles = {
    '/app': storeName || 'Vendor360',
    '/app/billing': t('nav.billing') || 'New Bill',
    '/app/stock': t('nav.stock') || 'Stock Inventory',
    '/app/khata': t('nav.khata') || 'Customer Khata',
    '/app/log': t('nav.log') || 'Voice Stock Log',
    '/app/scan': t('dashboard.scan') || 'Scan Paper Bill',
    '/app/intakes': t('dashboard.deliveries') || 'Stock Inward',
    '/app/forecast': t('nav.forecast') || 'Demand Forecast',
    '/app/score': t('nav.score') || 'Credit Health Score',
    '/app/heatmap': t('dashboard.heatmap') || 'Mandi & Demand Radar',
    '/app/account': t('account.title') || 'Store Profile',
    '/app/notifications': t('notifications_extra.title') || 'Notifications',
  };

  const isRootTab = path === '/app';
  const currentTitle = screenTitles[path] || storeName || 'Vendor360';

  // 4 Main Bottom Nav Tabs + 5th is More Menu
  const primaryNav = [
    { name: t('nav.home') || 'Home', path: '/app', icon: Home },
    { name: t('nav.billing') || 'Billing', path: '/app/billing', icon: ShoppingCart },
    { name: t('nav.stock') || 'Stock', path: '/app/stock', icon: Package, badge: alertCount },
    { name: t('nav.khata') || 'Khata', path: '/app/khata', icon: BookOpen },
  ];

  // Secondary apps accessible via native bottom sheet drawer
  const appDrawerItems = [
    { name: t('nav.log') || 'Voice Log', sub: t('app_shell.voice_sub'), path: '/app/log', icon: Mic, color: 'text-amber-500 bg-amber-500/10' },
    { name: t('dashboard.scan') || 'Scan Bill', sub: t('app_shell.scan_sub'), path: '/app/scan', icon: ScanLine, color: 'text-blue-500 bg-blue-500/10' },
    { name: t('dashboard.deliveries') || 'Deliveries', sub: t('app_shell.intakes_sub'), path: '/app/intakes', icon: Truck, color: 'text-emerald-500 bg-emerald-500/10' },
    { name: t('nav.forecast') || 'Forecast', sub: t('app_shell.forecast_sub'), path: '/app/forecast', icon: TrendingUp, color: 'text-indigo-500 bg-indigo-500/10' },
    { name: t('nav.score') || 'Health Score', sub: t('app_shell.score_sub'), path: '/app/score', icon: HeartPulse, color: 'text-rose-500 bg-rose-500/10' },
    { name: t('dashboard.heatmap') || 'Mandi Radar', sub: t('app_shell.heatmap_sub'), path: '/app/heatmap', icon: MapIcon, color: 'text-purple-500 bg-purple-500/10' },
    { name: t('notifications_extra.title') || 'Notifications', sub: t('app_shell.notifications_sub'), path: '/app/notifications', icon: Bell, color: 'text-orange-500 bg-orange-500/10', badge: alertCount },
    { name: t('account.title') || 'Store Profile', sub: t('app_shell.account_sub'), path: '/app/account', icon: User, color: 'text-teal-500 bg-teal-500/10' },
    { name: t('app_shell.legal_sub'), sub: t('app_shell.legal_sub'), path: '/legal', icon: ShieldCheck, color: 'text-slate-500 bg-slate-500/10' },
  ];

  const initials = (displayName || storeName || '?')
    .split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

  const changeLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('vendor_lang', langCode);
    setLangMenuOpen(false);
  };

  const currentLangObj = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-neutral-950 flex flex-col items-center justify-center p-0 md:py-4 selection:bg-brand-primary selection:text-white font-roboto antialiased">
      {/* Dedicated Native Mobile App Shell */}
      <div className="w-full max-w-lg h-screen md:h-[94vh] md:max-h-[920px] md:rounded-[36px] md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] md:border md:border-brand-border/80 flex flex-col bg-brand-surface relative overflow-hidden">
        
        {/* NATIVE APP TOP BAR */}
        <header className="no-print bg-brand-surface text-brand-ink px-4 py-2.5 sticky top-0 z-30 flex justify-between items-center border-b border-brand-border/40 shrink-0 shadow-sm">
          {/* Left: Back Arrow or Store Badge */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isRootTab ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-brand-primary text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                  V
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="font-bold text-sm font-inter text-brand-ink truncate leading-tight">
                      {storeName || 'Vendor360'}
                    </h1>
                    <span className="text-[9px] font-bold bg-brand-primary/15 text-brand-primary px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      {t('app_shell.kirana_badge')}
                    </span>
                  </div>
                  <p className="text-[10px] text-brand-muted truncate">{t('app_shell.smart_app')}</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-brand-ink hover:text-brand-primary transition-colors py-1 px-1 -ml-1 rounded-lg focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
                aria-label="Go back"
              >
                <div className="w-7 h-7 rounded-full bg-brand-bg flex items-center justify-center text-brand-ink">
                  <ArrowLeft size={17} />
                </div>
                <span className="font-bold text-sm font-inter truncate max-w-[170px] sm:max-w-[220px]">
                  {currentTitle}
                </span>
              </button>
            )}
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Quick Vernacular Language Selector */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen((prev) => !prev)}
                aria-label="Change language"
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-full bg-brand-bg hover:bg-brand-border/40 text-brand-ink transition-colors border border-brand-border/60"
              >
                <Globe size={13} className="text-brand-primary" />
                <span>{currentLangObj.code.toUpperCase()}</span>
              </button>

              {langMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                  <div className="absolute right-0 mt-1.5 w-40 bg-brand-surface border border-brand-border rounded-2xl shadow-xl z-50 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1 text-[10px] font-bold text-brand-muted uppercase tracking-wider border-b border-brand-border/40">
                      Language
                    </div>
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${
                          i18n.language === lang.code
                            ? 'bg-brand-primary/10 text-brand-primary font-bold'
                            : 'text-brand-ink hover:bg-brand-bg'
                        }`}
                      >
                        <span>{lang.label}</span>
                        {i18n.language === lang.code && <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Notifications Bell */}
            <Link
              to="/app/notifications"
              aria-label={alertCount ? `Alerts, ${alertCount} items need attention` : 'Alerts'}
              className="p-1.5 rounded-full text-brand-muted hover:text-brand-ink hover:bg-brand-bg transition-colors relative"
            >
              <Bell size={18} />
              {alertCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-3.5 px-0.5 bg-brand-danger text-white text-[8px] font-bold rounded-full border-2 border-brand-surface flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </Link>

            {/* Dark/Light Mode */}
            <button
              onClick={toggle}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-1.5 rounded-full text-brand-muted hover:text-brand-ink hover:bg-brand-bg transition-colors"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Account Profile Avatar */}
            <Link
              to="/app/account"
              title={displayName}
              aria-label="Account"
              className="ml-1 w-7 h-7 rounded-full bg-brand-primary text-brand-on-primary flex items-center justify-center text-xs font-bold shadow-sm hover:scale-105 transition-transform"
            >
              {initials}
            </Link>
          </div>
        </header>

        {/* NATIVE APP MAIN VIEWPORT */}
        <main className="app-main flex-1 overflow-y-auto p-3.5 sm:p-5 pb-24 bg-brand-bg overscroll-contain">
          <ErrorBoundary
            key={path}
            onReset={() => navigate('/app')}
            resetLabel="Back to home"
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/khata" element={<KhataDashboard />} />
              <Route path="/log" element={<VoiceEntry />} />
              <Route path="/stock" element={<Inventory />} />
              <Route path="/forecast" element={<Forecast />} />
              <Route path="/score" element={<HealthScore />} />
              <Route path="/scan" element={<ScanReceipt />} />
              <Route path="/intakes" element={<Intakes />} />
              <Route path="/account" element={<Account />} />
              <Route path="/heatmap" element={<Heatmap />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* NATIVE MOBILE BOTTOM NAVIGATION BAR */}
        <nav
          className="no-print app-safe-bottom absolute bottom-0 inset-x-0 bg-brand-surface border-t border-brand-border/60 px-2 pt-2 pb-2 flex justify-around items-center z-30 shadow-[0_-8px_25px_rgba(0,0,0,0.06)]"
          aria-label="App Navigation"
        >
          {primaryNav.map((item) => {
            const isActive = path === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center flex-1 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded-xl py-0.5 relative active:scale-95 transition-transform"
              >
                <div className={`px-3.5 py-1 rounded-full transition-all relative ${
                  isActive ? 'bg-brand-primary/15 text-brand-primary' : 'text-brand-muted hover:text-brand-ink'
                }`}>
                  <item.icon size={20} className={isActive ? 'text-brand-primary' : 'text-brand-muted'} />
                  {item.badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-danger rounded-full ring-2 ring-brand-surface" />
                  )}
                </div>
                <span className={`text-[10px] mt-0.5 font-bold transition-colors ${
                  isActive ? 'text-brand-primary' : 'text-brand-muted'
                }`}>
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* 5th Tab: Native Apps & Tools Drawer Launcher */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Kirana Apps and Tools"
            className="flex flex-col items-center flex-1 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded-xl py-0.5 active:scale-95 transition-transform"
          >
            <div className={`px-3.5 py-1 rounded-full transition-all ${
              moreOpen ? 'bg-brand-primary/15 text-brand-primary' : 'text-brand-muted hover:text-brand-ink'
            }`}>
              <Grid size={20} className={moreOpen ? 'text-brand-primary' : 'text-brand-muted'} />
            </div>
            <span className={`text-[10px] mt-0.5 font-bold transition-colors ${
              moreOpen ? 'text-brand-primary' : 'text-brand-muted'
            }`}>
              {t('app_shell.apps_tab')}
            </span>
          </button>
        </nav>

        {/* NATIVE MOBILE BOTTOM SHEET DRAWER ("APPS & TOOLS") */}
        {moreOpen && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end animate-in fade-in duration-200"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="bg-brand-surface w-full rounded-t-[32px] p-5 pb-8 app-safe-bottom max-h-[88%] overflow-y-auto border-t border-brand-border/60 shadow-2xl animate-in slide-in-from-bottom duration-250"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="w-12 h-1.5 bg-brand-border rounded-full mx-auto mb-4 opacity-70" />

              <div className="flex justify-between items-center mb-4 pb-2 border-b border-brand-border/40">
                <div>
                  <h2 className="font-bold text-base font-inter text-brand-ink">{t('app_shell.more_title')}</h2>
                  <p className="text-[11px] text-brand-muted">{t('app_shell.more_subtitle')}</p>
                </div>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full bg-brand-bg flex items-center justify-center text-brand-muted hover:text-brand-ink transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Grid of Apps */}
              <div className="grid grid-cols-3 gap-2.5">
                {appDrawerItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center text-center p-3 rounded-2xl bg-brand-bg hover:bg-brand-border/40 border border-brand-border/50 transition-all active:scale-95 relative"
                  >
                    {item.badge > 0 && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.2 bg-brand-danger text-white text-[8px] font-bold rounded-full">
                        {item.badge}
                      </span>
                    )}
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-2 shadow-sm ${item.color}`}>
                      <item.icon size={20} />
                    </div>
                    <span className="text-xs font-bold text-brand-ink leading-tight">
                      {item.name}
                    </span>
                    <span className="text-[9px] text-brand-muted mt-0.5 leading-tight line-clamp-1">
                      {item.sub}
                    </span>
                  </Link>
                ))}
              </div>

              {/* In-App Legal & Version Footer */}
              <div className="mt-5 pt-3 border-t border-brand-border/40 text-center">
                <p className="text-[10px] text-brand-muted">{t('app_shell.app_version')}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Direct App Entry - No Marketing Website! */}
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/legal" element={<Legal />} />
            <Route
              path="/app/*"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            />
            {/* Catch-all sends to /app */}
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
