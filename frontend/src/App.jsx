import { useState, useEffect } from 'react';
import './i18n';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Home, Package, Mic, TrendingUp, HeartPulse, Moon, Sun, Map as MapIcon, Bell, BookOpen } from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';

// Public Pages
import Landing from './pages/Landing';
import Legal from './pages/Legal';
import Auth from './pages/Auth';

// App Pages
import Dashboard from './pages/Dashboard';
import VoiceEntry from './pages/VoiceEntry';
import Inventory from './pages/Inventory';
import KhataDashboard from './pages/KhataDashboard';
import Forecast from './pages/Forecast';
import HealthScore from './pages/HealthScore';
import ScanReceipt from './pages/ScanReceipt';
import Account from './pages/Account';
import Heatmap from './pages/Heatmap';
import Notifications from './pages/Notifications';

// Protects the /app routes by checking for a token
function ProtectedRoute({ children }) {
  const isAuth = localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth');
  if (!isAuth) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function AppLayout() {
  const [isDark, setIsDark] = useState(false);
  const location = useLocation();
  const path = location.pathname;
  const { t } = useI18n();

  const navItems = [
    { name: t('nav.home'), path: '/app', icon: Home },
    { name: t('nav.khata'), path: '/app/khata', icon: BookOpen },
    { name: t('nav.stock'), path: '/app/stock', icon: Package },
    { name: t('nav.log'), path: '/app/log', icon: Mic },
    { name: t('nav.forecast'), path: '/app/forecast', icon: TrendingUp },
    { name: t('nav.score'), path: '/app/score', icon: HeartPulse },
    { name: t('dashboard.heatmap'), path: '/app/heatmap', icon: MapIcon } // Included in desktop sidebar
  ];

  useEffect(() => {
    if (localStorage.theme === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
      if (!localStorage.theme) {
        localStorage.theme = 'light';
      }
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setIsDark(true);
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-ink transition-colors duration-300 w-full overflow-hidden">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-64 flex-col bg-brand-surface border-r border-brand-border z-20 transition-colors shadow-sm">
        <div className="p-6 border-b border-brand-border">
          <Link to="/" className="text-2xl font-bold font-poppins text-brand-teal flex items-center">
            <div className="w-8 h-8 rounded bg-brand-teal text-white flex items-center justify-center mr-2 shadow-sm">V</div>
            Vendor360
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map(item => {
            const isActive = path === item.path;
            return (
              <Link 
                key={item.name} 
                to={item.path} 
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-brand-teal/10 text-brand-teal font-bold shadow-sm border border-brand-teal/20' 
                    : 'text-brand-muted hover:bg-brand-bg hover:text-brand-ink font-semibold border border-transparent'
                }`}
              >
                <item.icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* HEADER */}
        <header className="bg-brand-teal/90 backdrop-blur-md text-white px-4 py-3 md:py-4 md:px-8 sticky top-0 z-30 shadow-md flex justify-between items-center transition-colors">
          <div className="md:hidden">
            <Link to="/" className="block">
              <h1 className="font-semibold text-lg leading-tight">Vendor360</h1>
              <p className="text-[10px] text-white/80">{t('dashboard.title')}</p>
            </Link>
          </div>
          <div className="hidden md:block">
             <h2 className="font-bold text-xl font-poppins opacity-90">{t('dashboard.title')}</h2>
          </div>

          <div className="flex items-center space-x-3 md:space-x-4">
            <Link to="/app/notifications" className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors relative">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-danger rounded-full border border-brand-teal"></span>
            </Link>
            <button onClick={toggleTheme} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link to="/app/account" className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/20 flex items-center justify-center text-sm md:text-base font-bold shadow-sm hover:scale-105 transition-transform border border-white/30">
              ME
            </Link>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-5xl mx-auto h-full">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/khata" element={<KhataDashboard />} />
              <Route path="/log" element={<VoiceEntry />} />
              <Route path="/stock" element={<Inventory />} />
              <Route path="/forecast" element={<Forecast />} />
              <Route path="/score" element={<HealthScore />} />
              <Route path="/scan" element={<ScanReceipt />} />
              <Route path="/account" element={<Account />} />
              <Route path="/heatmap" element={<Heatmap />} />
              <Route path="/notifications" element={<Notifications />} />
            </Routes>
          </div>
        </main>

        {/* MOBILE BOTTOM NAV */}
        <div className="md:hidden fixed bottom-0 w-full bg-brand-surface/90 backdrop-blur-md border-t border-brand-border px-2 py-2 flex justify-between items-center z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] transition-colors">
          {navItems.filter(i => i.name !== t('dashboard.heatmap') && i.name !== t('nav.score')).map((item) => {
            const isActive = path === item.path;
            return (
              <Link key={item.name} to={item.path} className="flex flex-col items-center p-2 flex-1">
                <item.icon size={22} className={isActive ? 'text-brand-teal' : 'text-brand-muted'} />
                <span className={`text-[9px] mt-1 ${isActive ? 'text-brand-teal font-bold' : 'text-brand-muted font-medium'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/app/*" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      } />
    </Routes>
  );
}
