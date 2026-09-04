import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { 
  Mic, ScanLine, TrendingUp, AlertTriangle, Map, DollarSign, 
  Percent, QrCode, Sparkles 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ExpiryAlert from '../components/ExpiryAlert';
import CheckoutModal from '../components/CheckoutModal';

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
        const res = await axios.get(`http://127.0.0.1:8000/api/analytics/sales-trend/${authData?.vendor_id}`);
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      
      {/* Top POS UPI Action Banner */}
      <div className="bg-gradient-to-r from-brand-teal to-brand-teal-dark text-white rounded-2xl p-4 md:p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20">
            <QrCode size={26} className="text-white" />
          </div>
          <div>
            <h2 className="font-extrabold text-base md:text-lg font-poppins">Instant UPI QR Checkout</h2>
            <p className="text-xs text-white/80">Generate dynamic QR for instant customer payments</p>
          </div>
        </div>

        <button
          onClick={() => setIsCheckoutOpen(true)}
          className="bg-white text-brand-teal px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm shadow-md hover:bg-white/90 active:scale-95 transition-all flex items-center justify-center space-x-2 self-start sm:self-auto"
        >
          <QrCode size={16} />
          <span>Open Scanner QR</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-brand-surface rounded-xl p-4 shadow-sm border border-brand-border transition-colors">
          <p className="text-xs text-brand-muted uppercase tracking-wider font-semibold">{t('dashboard.sales_today')}</p>
          <p className="text-xl md:text-2xl font-bold text-brand-ink mt-1 font-poppins">
            {loading ? '...' : `₹${data?.today_sales}`}
          </p>
        </div>
        
        <div className="bg-brand-surface rounded-xl p-4 shadow-sm border border-brand-border transition-colors">
          <p className="text-xs text-brand-muted uppercase tracking-wider font-semibold">{t('dashboard.profit_margin')}</p>
          <p className="text-xl md:text-2xl font-bold text-brand-teal mt-1 flex items-center">
            {loading ? '...' : `${data?.margin_pct}%`}
          </p>
        </div>
        
        <div className="bg-brand-surface rounded-xl p-4 shadow-sm border border-brand-border transition-colors hidden md:block">
          <p className="text-xs text-brand-muted uppercase tracking-wider font-semibold">Weekly Profit</p>
          <p className="text-xl md:text-2xl font-bold text-brand-ink mt-1 font-poppins">
            {loading ? '...' : `₹${Math.round(data?.trend.reduce((acc, curr) => acc + curr.profit, 0))}`}
          </p>
        </div>

        <div className="bg-brand-surface rounded-xl p-4 shadow-sm border border-brand-border transition-colors">
          <p className="text-xs text-brand-muted uppercase tracking-wider font-semibold">{t('dashboard.health_score')}</p>
          <p className="text-xl md:text-2xl font-bold text-brand-amber mt-1">78/100</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 md:gap-6">
        
        {/* Left Column (Chart + Actions) */}
        <div className="md:col-span-2 space-y-4 md:space-y-6">
          
          {/* Sales Trend Chart */}
          <div className="bg-brand-surface rounded-xl p-4 md:p-6 shadow-sm border border-brand-border transition-colors">
            <h2 className="text-sm md:text-base font-semibold text-brand-ink mb-4">7-Day Sales Trend</h2>
            <div className="w-full h-48 md:h-64">
              {!loading && data && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(val) => `₹${val}`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#1f2937' }}
                    />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke="#0F7A6B" strokeWidth={3} dot={{ r: 4, fill: '#0F7A6B', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#D98A0F" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {loading && <div className="w-full h-full flex items-center justify-center text-brand-muted">Loading chart...</div>}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-sm md:text-base font-semibold text-brand-ink mb-3">{t('dashboard.quick_actions')}</h2>
            <div className="grid grid-cols-4 md:grid-cols-4 gap-2 md:gap-4">
              <Link to="/app/log" className="bg-brand-surface rounded-xl p-3 md:p-5 border border-brand-border shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-brand-amber/50 hover:shadow-md transition-all">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-brand-amber/10 flex items-center justify-center text-brand-amber">
                  <Mic className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className="text-[10px] md:text-xs font-semibold text-brand-ink">{t('dashboard.voice_log')}</span>
              </Link>
              
              <Link to="/app/scan" className="bg-brand-surface rounded-xl p-3 md:p-5 border border-brand-border shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-brand-teal/50 hover:shadow-md transition-all">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal">
                  <ScanLine className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className="text-[10px] md:text-xs font-semibold text-brand-ink">{t('dashboard.scan')}</span>
              </Link>
              
              <Link to="/app/khata" className="bg-brand-surface rounded-xl p-3 md:p-5 border border-brand-border shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-brand-teal/50 hover:shadow-md transition-all">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-brand-danger/10 flex items-center justify-center text-brand-danger">
                  <DollarSign className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className="text-[10px] md:text-xs font-semibold text-brand-ink">{t('dashboard.khata') || 'Khata'}</span>
              </Link>

              <button 
                onClick={() => setIsCheckoutOpen(true)}
                className="bg-brand-surface rounded-xl p-3 md:p-5 border border-brand-border shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-brand-teal/50 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal">
                  <QrCode className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <span className="text-[10px] md:text-xs font-semibold text-brand-ink">UPI QR</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (Live Expiry Alert & AI Suggestions) */}
        <div className="space-y-4 md:space-y-6">
          
          {/* Live Expiry Alert Component */}
          <div>
            <h2 className="text-sm md:text-base font-semibold text-brand-ink mb-3">Critical Expiry Warning</h2>
            <ExpiryAlert compact={true} />
          </div>

          {/* AI Suggestion */}
          <div>
            <h2 className="text-sm md:text-base font-semibold text-brand-ink mb-3">{t('dashboard.ai_suggestions')}</h2>
            <div className="bg-brand-teal/10 border border-brand-teal/20 rounded-xl p-5 shadow-sm transition-colors flex flex-col justify-center">
              <div className="flex items-start space-x-4">
                <div className="text-brand-teal mt-1 text-2xl">🌧️</div>
                <div>
                  <p className="text-sm md:text-base font-bold text-brand-teal-dark">Rain expected tomorrow</p>
                  <p className="text-xs text-brand-teal-dark/80 mt-1 mb-4">Stock +20% umbrellas to meet anticipated spike in demand.</p>
                  <Link to="/app/stock" className="inline-block bg-brand-teal text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-brand-teal-dark transition-colors shadow-sm">
                    Reorder Now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Checkout UPI Modal */}
      <CheckoutModal 
        isOpen={isCheckoutOpen} 
        onClose={() => setIsCheckoutOpen(false)} 
        initialAmount={150}
      />
    </div>
  );
}
