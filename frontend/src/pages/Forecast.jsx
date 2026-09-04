import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { CloudRain, Sparkles, TrendingUp } from 'lucide-react';

export default function Forecast() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecasts = async () => {
      try {
        const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
        const res = await axios.get(`http://127.0.0.1:8000/api/analytics/forecast/${authData?.vendor_id}`);
        setForecasts(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchForecasts();
  }, []);

  return (
    <div className="space-y-4 pb-4">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-brand-ink">Demand Forecast</h2>
        <p className="text-xs text-brand-muted">AI predictions for this week</p>
      </div>

      {loading ? (
        <p className="text-center text-brand-muted py-10">Analyzing trends...</p>
      ) : (
        <div className="space-y-3">
          {forecasts.map(f => (
            <div key={f.id} className="bg-brand-surface rounded-xl p-4 border border-brand-border shadow-sm transition-colors">
              <div className="flex items-start space-x-3 mb-3">
                <div className={`p-2 rounded-full ${f.type === 'weather' ? 'bg-blue-500/10 text-blue-500' : 'bg-brand-amber/20 text-brand-amber'}`}>
                  {f.type === 'weather' ? <CloudRain size={20} /> : <Sparkles size={20} />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-brand-ink">{f.driver}</h3>
                  <p className="text-[11px] text-brand-muted mt-0.5">Suggested restock: {f.item_name} +{f.predicted_demand_increase_pct}%</p>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-brand-border flex items-center justify-between">
                <div className="flex items-center text-brand-teal text-xs font-semibold">
                  <TrendingUp size={14} className="mr-1" />
                  Demand Spiking
                </div>
                <Link to="/app/stock" className="text-[11px] bg-brand-bg border border-brand-border px-3 py-1.5 rounded-lg text-brand-ink font-semibold active:opacity-80 transition-opacity">
                  Review Stock
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
