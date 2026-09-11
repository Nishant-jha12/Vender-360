import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function Legal() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-neutral-950 flex flex-col items-center justify-center p-0 md:py-6 font-roboto antialiased">
      <div className="w-full max-w-md h-screen md:h-auto md:min-h-[700px] md:max-h-[90vh] md:rounded-[36px] bg-brand-surface border-0 md:border md:border-brand-border/80 shadow-2xl overflow-hidden flex flex-col">
        {/* App Bar Header */}
        <header className="bg-brand-surface text-brand-ink px-4 py-3 sticky top-0 z-30 flex items-center gap-3 border-b border-brand-border/40 shrink-0 shadow-sm">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="w-8 h-8 rounded-full bg-brand-bg flex items-center justify-center text-brand-ink hover:text-brand-primary transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand-primary" />
            <h1 className="font-bold text-sm font-inter text-brand-ink">Terms & Privacy Policy</h1>
          </div>
        </header>

        {/* Scrollable Policy Content */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4 text-brand-ink">
          <section className="bg-brand-bg p-4 rounded-2xl border border-brand-border/60">
            <h2 className="text-sm font-bold font-inter mb-1.5 text-brand-primary">1. Unique Vendor Identification</h2>
            <p className="text-xs text-brand-muted leading-relaxed">
              Upon registration, each vendor is assigned a unique identifier (e.g., <strong>V360-XXXX</strong>). This acts as your digital footprint to associate historical sales, inventory, and micro-credit health score.
            </p>
          </section>

          <section className="bg-brand-bg p-4 rounded-2xl border border-brand-border/60">
            <h2 className="text-sm font-bold font-inter mb-1.5 text-brand-primary">2. Micro-Credit Health Score & Data Sharing</h2>
            <p className="text-xs text-brand-muted leading-relaxed">
              Vendor360 computes an operational discipline score. Your raw sales data is never sold. With your explicit consent, your score and Vendor ID may be shared with partnered NBFC lenders for micro-credit loans.
            </p>
          </section>

          <section className="bg-brand-bg p-4 rounded-2xl border border-brand-border/60">
            <h2 className="text-sm font-bold font-inter mb-1.5 text-brand-primary">3. Hyperlocal Demand Radar</h2>
            <p className="text-xs text-brand-muted leading-relaxed">
              To provide hyperlocal demand forecasting, Vendor360 aggregates anonymized sales data across regional wholesale zones. Store locations and PII are never exposed publicly.
            </p>
          </section>

          <section className="bg-brand-bg p-4 rounded-2xl border border-brand-border/60">
            <h2 className="text-sm font-bold font-inter mb-1.5 text-brand-primary">4. Acceptable App Usage</h2>
            <ul className="list-disc list-inside text-xs text-brand-muted space-y-1.5 ml-1">
              <li>OCR and Voice logging tools are for legitimate store inventory.</li>
              <li>Attempting to manipulate credit algorithms is strictly prohibited.</li>
              <li>Accounts with fraudulent data entries may be suspended.</li>
            </ul>
          </section>
        </main>

        <footer className="p-3 border-t border-brand-border/40 text-center bg-brand-bg/50 shrink-0">
          <p className="text-[10px] text-brand-muted">Vendor360 Legal Policy • Last updated September 2026</p>
        </footer>
      </div>
    </div>
  );
}
