import { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, Info } from 'lucide-react';

export default function HealthScore() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScore = async () => {
      try {
        const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
        const res = await axios.get(`http://127.0.0.1:8000/api/analytics/health-score/${authData?.vendor_id}`);
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchScore();
  }, []);

  if (loading) {
    return <p className="text-center text-brand-muted py-10">Calculating score...</p>;
  }

  if (!data) return null;

  const { breakdown } = data;

  return (
    <div className="space-y-6 pb-4">
      {/* Main Score Card */}
      <div className="bg-brand-teal text-white rounded-2xl p-6 text-center shadow-lg relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 p-4 opacity-20">
          <ShieldCheck size={100} />
        </div>
        <h2 className="text-sm font-semibold opacity-90 relative z-10">Vendor Health Score</h2>
        <p className="text-[10px] opacity-75 relative z-10 mb-4">Your credit-readiness signal</p>
        
        <div className="w-32 h-32 mx-auto rounded-full border-8 border-white/20 flex flex-col items-center justify-center relative z-10 bg-brand-teal-dark/30 shadow-inner">
          <span className="text-4xl font-bold font-poppins">{data.health_score}</span>
          <span className="text-[10px] opacity-80 uppercase tracking-widest mt-1">Out of 100</span>
        </div>
        
        <div className="mt-5 inline-block bg-white/20 px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm relative z-10">
          Eligible for Micro-Credit
        </div>
      </div>

      {/* Breakdown */}
      <div>
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-sm font-bold text-brand-ink">Score Breakdown</h3>
          <Info size={14} className="text-brand-muted" />
        </div>
        
        <div className="bg-brand-surface rounded-xl border border-brand-border shadow-sm p-2 space-y-1 transition-colors">
          <ScoreRow label="Sales Consistency" value={`${breakdown.sales_consistency}%`} color="bg-brand-teal" width={breakdown.sales_consistency} />
          <ScoreRow label="Inventory Turnover" value={`${breakdown.inventory_turnover}%`} color="bg-brand-teal" width={breakdown.inventory_turnover} />
          <ScoreRow label="Waste / Spoilage" value="Low" color="bg-brand-amber" width={100 - breakdown.waste_spoilage} />
          <ScoreRow label="On-time Restocking" value={`${breakdown.on_time_restocking}%`} color="bg-brand-teal" width={breakdown.on_time_restocking} />
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ label, value, color, width }) {
  return (
    <div className="p-3 flex items-center justify-between border-b border-brand-bg last:border-0">
      <div className="w-1/2">
        <span className="text-xs font-semibold text-brand-ink">{label}</span>
      </div>
      <div className="w-1/2 flex items-center justify-end space-x-3">
        <div className="flex-1 bg-brand-bg h-1.5 rounded-full overflow-hidden flex justify-end">
          <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${width}%` }}></div>
        </div>
        <span className={`text-xs font-bold w-8 text-right ${color.replace('bg-', 'text-')}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
