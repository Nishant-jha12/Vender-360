import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, Activity, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Notifications() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
        const res = await axios.get(`http://127.0.0.1:8000/api/analytics/activities/${authData?.vendor_id}`);
        setLogs(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6 pb-4 max-w-2xl mx-auto">
      <div className="flex items-center space-x-2">
        <Bell className="text-brand-teal" size={24} />
        <div>
          <h2 className="text-lg font-bold text-brand-ink">{t('dashboard.alerts') || 'Activity Feed'}</h2>
          <p className="text-xs text-brand-muted">Recent events in your store</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-brand-muted py-10 animate-pulse">Loading feed...</p>
      ) : (
        <div className="space-y-3">
          {logs.map((log, index) => (
            <div key={log.id} className="bg-brand-surface rounded-xl p-4 border border-brand-border shadow-sm flex items-start space-x-3 transition-colors">
              <div className="bg-brand-bg p-2 rounded-lg text-brand-teal mt-0.5">
                <Activity size={18} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-bold text-brand-ink">{log.action}</h3>
                  <span className="text-[10px] text-brand-muted flex items-center font-semibold uppercase tracking-wider">
                    <Clock size={10} className="mr-1" /> {log.time}
                  </span>
                </div>
                <p className="text-xs text-brand-muted mt-1 leading-relaxed">{log.details}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
