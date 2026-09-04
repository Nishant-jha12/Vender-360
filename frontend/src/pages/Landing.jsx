import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Smartphone, Zap, ShieldCheck } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink transition-colors duration-300">
      {/* Navbar */}
      <nav className="border-b border-brand-border bg-brand-surface sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold font-inter text-brand-primary flex items-center">
            <div className="w-8 h-8 rounded bg-brand-primary text-white flex items-center justify-center mr-2">
              V
            </div>
            Vendor360
          </div>
          <div className="space-x-6 hidden md:flex font-semibold text-sm">
            <a href="#features" className="hover:text-brand-primary transition-colors">Features</a>
            <Link to="/legal" className="hover:text-brand-primary transition-colors">Legal Terms</Link>
          </div>
          <div>
            <Link to="/auth" className="bg-brand-primary text-brand-on-primary px-5 py-2.5 rounded-full font-bold text-sm shadow-md hover:bg-brand-primary-dark transition-colors flex items-center">
              Sign in <ArrowRight size={16} className="ml-2" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-6xl mx-auto px-4 py-20 text-center flex flex-col items-center">
        <div className="inline-block bg-brand-primary/10 text-brand-primary px-4 py-1.5 rounded-full text-sm font-bold mb-6">
Built for neighbourhood shops
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold font-inter max-w-4xl leading-tight mb-6 text-brand-ink">
          Turn your neighbourhood store into a <span className="text-brand-primary">smart business.</span>
        </h1>
        <p className="text-lg md:text-xl text-brand-muted max-w-2xl mb-10">
          Bill a customer in seconds, keep your stock count honest, and know exactly
          who owes you what. Every number Vendor360 shows is worked out from your own
          sales — nothing is estimated.
        </p>
        <div className="flex space-x-4">
          <Link to="/auth" className="bg-brand-ink text-brand-surface px-8 py-4 rounded-full font-bold text-lg shadow-xl hover:scale-105 transition-transform flex items-center">
            Get started free
          </Link>
          <a href="#features" className="bg-brand-surface border-2 border-brand-border text-brand-ink px-8 py-4 rounded-full font-bold text-lg hover:bg-brand-bg transition-colors">
            Learn More
          </a>
        </div>
      </header>

      {/* Features Grid */}
      <section id="features" className="bg-brand-surface py-20 border-t border-brand-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-inter mb-4">Everything you need to scale</h2>
            <p className="text-brand-muted max-w-xl mx-auto">Billing, stock and udhaar in one place, in your language.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 border border-brand-border rounded-2xl bg-brand-bg hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-brand-amber/10 text-brand-amber flex items-center justify-center mb-6">
                <Smartphone size={28} />
              </div>
              <h3 className="text-xl font-bold mb-3">Bill in seconds</h3>
              <p className="text-brand-muted text-sm">Tap your regular items, take cash, UPI or udhaar, and stock updates itself.</p>
            </div>
            
            <div className="p-8 border border-brand-border rounded-2xl bg-brand-bg hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-6">
                <Zap size={28} />
              </div>
              <h3 className="text-xl font-bold mb-3">Digital khata</h3>
              <p className="text-brand-muted text-sm">Every udhaar tracked, with a WhatsApp reminder one tap away when payment is due.</p>
            </div>

            <div className="p-8 border border-brand-border rounded-2xl bg-brand-bg hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-6">
                <BarChart3 size={28} />
              </div>
              <h3 className="text-xl font-bold mb-3">Numbers you can trust</h3>
              <p className="text-brand-muted text-sm">Sales, profit and expiry risk, all computed from your own bills — never estimated.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-ink text-brand-surface py-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          <div className="text-2xl font-bold font-inter flex items-center mb-4 md:mb-0">
            <div className="w-8 h-8 rounded bg-brand-surface text-brand-ink flex items-center justify-center mr-2">
              V
            </div>
            Vendor360
          </div>
          <div className="space-x-6 text-sm opacity-80">
            <Link to="/legal" className="hover:opacity-100 transition-opacity">Terms of Service</Link>
            <Link to="/legal" className="hover:opacity-100 transition-opacity">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
