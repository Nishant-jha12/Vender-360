import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  Bell, BookOpen, HeartPulse, Home, Loader2, Map as MapIcon, Menu, Mic, Moon,
  MoreHorizontal, Package, ScanLine, ShoppingCart, Sun, TrendingUp, Truck, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { useApi } from './hooks/useApi';

import Landing from './pages/Landing';
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
import VoiceEntry from './pages/VoiceEntry';

function ProtectedRoute({ children }) {
  const { isAuthenticated, checking } = useAuth();

  // Wait for the stored token to be validated. Previously any string in
  // localStorage counted as a session, so a revoked token still got you in.
  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-bg">
        <Loader2 className="animate-spin text-brand-primary" size={32} />
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
}

function useTheme() {
  // The inline script in index.html has already applied the class before first
  // paint; this only mirrors it into React state.
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  return { isDark, toggle };
}

function AppLayout() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isDark, toggle } = useTheme();
  const { displayName, storeName } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  // The alert dot means something now: it tracks stock actually about to expire.
  const expiring = useApi('/inventory/expiring-soon', { params: { days: 7 } });
  const alertCount = expiring.data?.length || 0;

  const path = location.pathname;
  useEffect(() => setMoreOpen(false), [path]);

  const primaryNav = [
    { name: t('nav.home'), path: '/app', icon: Home },
    { name: t('nav.billing'), path: '/app/billing', icon: ShoppingCart },
    { name: t('nav.stock'), path: '/app/stock', icon: Package },
    { name: t('nav.khata'), path: '/app/khata', icon: BookOpen },
  ];
  const secondaryNav = [
    { name: t('nav.log'), path: '/app/log', icon: Mic },
    { name: t('dashboard.scan'), path: '/app/scan', icon: ScanLine },
    { name: t('dashboard.deliveries'), path: '/app/intakes', icon: Truck },
    { name: t('nav.forecast'), path: '/app/forecast', icon: TrendingUp },
    { name: t('nav.score'), path: '/app/score', icon: HeartPulse },
    { name: t('dashboard.heatmap'), path: '/app/heatmap', icon: MapIcon },
  ];
  const allNav = [...primaryNav, ...secondaryNav];

  const initials = (displayName || storeName || '?')
    .split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="app-shell flex h-screen bg-brand-bg text-brand-ink w-full overflow-hidden font-roboto">
      <aside
        className={`no-print hidden md:flex flex-col bg-brand-bg z-20 transition-all duration-200 ${
          sidebarOpen ? 'w-64' : 'w-[76px]'
        }`}
      >
        <div className="p-4 pl-5 flex items-center h-16 gap-3">
          <button
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={sidebarOpen}
            className="text-brand-muted hover:bg-brand-border/50 rounded-full p-2 transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
          >
            <Menu size={20} />
          </button>
          {sidebarOpen && (
            <Link to="/" className="text-xl font-medium font-inter text-brand-ink truncate">
              <span className="text-brand-primary font-bold mr-0.5 text-2xl">V</span>endor360
            </Link>
          )}
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label="Main">
          {allNav.map((item) => {
            const isActive = path === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={sidebarOpen ? undefined : item.name}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-4 px-4 py-3 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-brand-primary outline-none ${
                  isActive
                    ? 'bg-brand-primary/10 text-brand-primary font-semibold'
                    : 'text-brand-ink hover:bg-brand-border/50 font-medium'
                }`}
              >
                <item.icon size={21} className={isActive ? 'text-brand-primary' : 'text-brand-muted'} />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="app-column flex-1 flex flex-col min-w-0 relative bg-brand-surface md:rounded-tl-3xl md:m-2 md:ml-0 md:shadow-[0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden border border-brand-border/40">
        <header className="no-print bg-brand-surface text-brand-ink px-4 py-2 md:py-3 md:px-6 sticky top-0 z-30 flex justify-between items-center border-b border-brand-border/30">
          <div className="md:hidden">
            <Link to="/" className="font-medium text-lg font-inter tracking-tight">
              <span className="text-brand-primary font-bold">V</span>endor360
            </Link>
          </div>
          <div className="hidden md:block min-w-0">
            <h1 className="font-medium text-lg font-inter text-brand-ink truncate">
              {allNav.find((item) => item.path === path)?.name || storeName}
            </h1>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <Link
              to="/app/notifications"
              aria-label={alertCount ? `Alerts, ${alertCount} items need attention` : 'Alerts'}
              className="p-2 rounded-full text-brand-muted hover:bg-brand-bg transition-colors relative focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
            >
              <Bell size={21} />
              {alertCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-brand-danger text-white text-[9px] font-bold rounded-full border-2 border-brand-surface flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </Link>
            <button
              onClick={toggle}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-full text-brand-muted hover:bg-brand-bg transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
            >
              {isDark ? <Sun size={21} /> : <Moon size={21} />}
            </button>
            <Link
              to="/app/account"
              title={displayName}
              aria-label="Account"
              className="ml-1 w-9 h-9 rounded-full bg-brand-primary text-brand-on-primary flex items-center justify-center text-sm font-bold hover:bg-brand-primary-dark transition-colors focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
            >
              {initials}
            </Link>
          </div>
        </header>

        <main className="app-main flex-1 overflow-y-auto p-4 md:p-8 pb-28 md:pb-8 bg-brand-surface">
          <div className="app-main max-w-5xl mx-auto h-full">
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
          </div>
        </main>

        {/* Mobile nav. Overflow items live behind "More" instead of being
            filtered out by their translated label, which left Score and Heatmap
            unreachable on a phone -- and broke entirely in Hindi. */}
        <nav
          className="no-print md:hidden fixed bottom-0 inset-x-0 bg-brand-bg border-t border-brand-border px-1 py-2 flex justify-around items-center z-30"
          aria-label="Main"
        >
          {primaryNav.map((item) => {
            const isActive = path === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center flex-1 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded-lg py-0.5"
              >
                <span className={`px-4 py-1 rounded-full transition-colors ${isActive ? 'bg-brand-primary/20' : ''}`}>
                  <item.icon size={21} className={isActive ? 'text-brand-primary' : 'text-brand-muted'} />
                </span>
                <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-brand-ink' : 'text-brand-muted'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More pages"
            className="flex flex-col items-center flex-1 focus-visible:ring-2 focus-visible:ring-brand-primary outline-none rounded-lg py-0.5"
          >
            <span className="px-4 py-1 rounded-full">
              <MoreHorizontal size={21} className="text-brand-muted" />
            </span>
            <span className="text-[10px] mt-0.5 font-medium text-brand-muted">More</span>
          </button>
        </nav>

        {moreOpen && (
          <div className="md:hidden fixed inset-0 bg-black/50 z-40 flex items-end" onClick={() => setMoreOpen(false)}>
            <div className="bg-brand-surface w-full rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-brand-ink">More</h2>
                <button onClick={() => setMoreOpen(false)} aria-label="Close" className="text-brand-muted p-1">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {secondaryNav.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-brand-bg border border-brand-border"
                  >
                    <item.icon size={22} className="text-brand-primary" />
                    <span className="text-[11px] font-semibold text-brand-ink text-center leading-tight">
                      {item.name}
                    </span>
                  </Link>
                ))}
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
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/app/*"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
