import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Legal() {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink transition-colors duration-300">
      <nav className="border-b border-brand-border bg-brand-surface sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center">
          <Link to="/" className="text-brand-muted hover:text-brand-ink mr-4 transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div className="text-xl font-bold font-poppins text-brand-teal">
            Vendor360 Legal
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-extrabold mb-8 font-poppins">Terms of Service & Privacy Policy</h1>
        
        <div className="prose prose-brand max-w-none space-y-8">
          <section className="bg-brand-surface p-8 rounded-2xl border border-brand-border">
            <h2 className="text-2xl font-bold mb-4">1. Unique Vendor Identification</h2>
            <p className="text-brand-muted leading-relaxed">
              Upon registration, each vendor is assigned a unique tracking identifier (e.g., <strong>V360-XXXX</strong>). This code acts as your official digital footprint on the platform and is used to associate your historical sales data, inventory turnover, and micro-credit health score. Do not share your login credentials with unauthorized personnel.
            </p>
          </section>

          <section className="bg-brand-surface p-8 rounded-2xl border border-brand-border">
            <h2 className="text-2xl font-bold mb-4">2. Micro-Credit Health Score & Data Sharing</h2>
            <p className="text-brand-muted leading-relaxed">
              Vendor360 computes a transparent "Health Score" based on your operational discipline (sales consistency, waste minimization, and restocking punctuality). By using this platform, you explicitly consent to the generation of this score. 
            </p>
            <p className="text-brand-muted leading-relaxed mt-4">
              <strong>Data Sharing:</strong> Your raw transaction data is never sold to third parties. However, with your explicit opt-in consent inside the app, your computed Health Score and Vendor ID may be shared with our partnered Non-Banking Financial Companies (NBFCs) to facilitate micro-credit loan eligibility.
            </p>
          </section>

          <section className="bg-brand-surface p-8 rounded-2xl border border-brand-border">
            <h2 className="text-2xl font-bold mb-4">3. B2B Heatmap & Aggregated Insights</h2>
            <p className="text-brand-muted leading-relaxed">
              To provide hyperlocal demand forecasting, Vendor360 aggregates anonymized sales data across geographic regions. No personally identifiable information (PII) or exact store locations are exposed in the B2B Heatmap. All geospatial data is abstracted to generic neighborhood zones (e.g., "Sector 14") to protect vendor privacy while enabling collective bargaining advantages.
            </p>
          </section>

          <section className="bg-brand-surface p-8 rounded-2xl border border-brand-border">
            <h2 className="text-2xl font-bold mb-4">4. Acceptable Use</h2>
            <ul className="list-disc list-inside text-brand-muted space-y-2 ml-4">
              <li>You agree to use the OCR and Voice logging tools strictly for legitimate store operations.</li>
              <li>You agree not to reverse engineer or manipulate the Health Score generation algorithm.</li>
              <li>Vendor360 reserves the right to suspend any Vendor ID engaging in fraudulent data entry intended to artificially inflate credit eligibility.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
