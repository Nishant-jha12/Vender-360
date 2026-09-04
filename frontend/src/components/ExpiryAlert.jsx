import { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Clock, ShieldAlert, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ExpiryAlert({ compact = false }) {
  const [expiringItems, setExpiringItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExpiring = async () => {
      try {
        const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
        const vendorParam = authData?.vendor_id ? `?vendor_id=${authData.vendor_id}` : '';
        const res = await axios.get(`http://127.0.0.1:8000/api/inventory/expiring-soon${vendorParam}`);
        setExpiringItems(res.data);
      } catch (err) {
        console.error("Failed to fetch expiring items:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExpiring();
  }, []);

  if (loading) return null;
  if (expiringItems.length === 0) return null;

  const criticalItems = expiringItems.filter(i => i.urgency === 'critical');
  const totalLossRisk = expiringItems.reduce((sum, item) => sum + (item.estimated_loss_risk || 0), 0);

  if (compact) {
    return (
      <Link to="/app/stock" className="block">
        <div className="bg-brand-danger/10 border border-brand-danger/25 rounded-2xl p-4 flex items-start space-x-3 hover:bg-brand-danger/15 transition-all shadow-sm">
          <div className="p-2 rounded-xl bg-brand-danger/20 text-brand-danger shrink-0 mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-brand-danger">
                {expiringItems.length} {expiringItems.length === 1 ? 'item' : 'items'} expiring this week!
              </p>
              <span className="text-[10px] uppercase font-extrabold bg-brand-danger text-white px-2 py-0.5 rounded-full">
                Action Required
              </span>
            </div>
            <p className="text-xs text-brand-danger/90 mt-1">
              {expiringItems.slice(0, 3).map(i => `${i.sku_name} (${i.days_left}d)`).join(', ')}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-danger/20 text-[11px] font-semibold text-brand-danger">
              <span>Potential Loss Risk: ₹{totalLossRisk.toFixed(0)}</span>
              <span className="flex items-center hover:underline">
                Review & Discount <ArrowRight size={12} className="ml-1" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="bg-brand-surface rounded-2xl border border-brand-danger/30 shadow-md p-5 relative overflow-hidden transition-all">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-danger/10 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2.5 rounded-xl bg-brand-danger/10 text-brand-danger border border-brand-danger/20">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-brand-ink flex items-center">
              Wastage & Expiry Tracker
              <span className="ml-2 text-xs bg-brand-danger text-white px-2 py-0.5 rounded-full font-bold">
                {expiringItems.length} Near Expiry
              </span>
            </h3>
            <p className="text-xs text-brand-muted mt-0.5">Automated detection to minimize stock spoilage</p>
          </div>
        </div>

        <div className="text-left sm:text-right bg-brand-bg px-3 py-1.5 rounded-xl border border-brand-border inline-block">
          <p className="text-[10px] text-brand-muted uppercase font-bold tracking-wider">Estimated Loss Risk</p>
          <p className="text-base font-extrabold text-brand-danger font-poppins">₹{totalLossRisk.toFixed(2)}</p>
        </div>
      </div>

      {/* Expiring Items Grid */}
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        {expiringItems.map((item) => {
          const isCritical = item.urgency === 'critical';
          return (
            <div 
              key={item.id} 
              className={`rounded-xl p-3.5 border transition-all ${
                isCritical 
                  ? 'bg-brand-danger/5 border-brand-danger/25' 
                  : 'bg-brand-amber/5 border-brand-amber/25'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-brand-ink leading-tight">{item.sku_name}</h4>
                  <p className="text-[11px] text-brand-muted mt-0.5">
                    Stock: <span className="font-semibold text-brand-ink">{item.current_qty} {item.unit}</span> (Cost: ₹{item.cost_price})
                  </p>
                </div>

                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  isCritical 
                    ? 'bg-brand-danger text-white' 
                    : 'bg-brand-amber text-brand-ink'
                }`}>
                  {item.days_left === 0 ? 'Expires Today' : `${item.days_left}d Left`}
                </span>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-brand-border/60 text-xs">
                <span className="text-[11px] text-brand-muted flex items-center">
                  <Clock size={12} className="mr-1" /> Exp: {new Date(item.expiry_date).toLocaleDateString()}
                </span>

                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold text-brand-danger">
                    Risk: ₹{item.estimated_loss_risk}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
