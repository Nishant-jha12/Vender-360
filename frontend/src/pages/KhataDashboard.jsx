import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, UserPlus, Phone, Search, Plus, Minus, ArrowDownLeft, 
  ArrowUpRight, Clock, CheckCircle2, AlertCircle, Loader2, X, Receipt, QrCode 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CheckoutModal from '../components/CheckoutModal';

export default function KhataDashboard() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [modalType, setModalType] = useState(null); // 'payment', 'credit', 'history'
  const [checkoutCustomer, setCheckoutCustomer] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New Customer Form State
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    initial_credit_balance: ''
  });

  const getAuthData = () => {
    return JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const authData = getAuthData();
      const vendorParam = authData?.vendor_id ? `?vendor_id=${authData.vendor_id}` : '';
      const res = await axios.get(`http://127.0.0.1:8000/api/customers${vendorParam}`);
      setCustomers(res.data);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) return;
    setSubmitting(true);
    try {
      const authData = getAuthData();
      await axios.post('http://127.0.0.1:8000/api/customers', {
        name: newCustomer.name,
        phone: newCustomer.phone || null,
        vendor_id: authData?.vendor_id || null,
        initial_credit_balance: parseFloat(newCustomer.initial_credit_balance) || 0.0
      });
      setIsAddCustomerOpen(false);
      setNewCustomer({ name: '', phone: '', initial_credit_balance: '' });
      fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransaction = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!activeCustomer || isNaN(numAmount) || numAmount <= 0) return;

    setSubmitting(true);
    try {
      await axios.post(`http://127.0.0.1:8000/api/khata/${activeCustomer.id}/transaction`, {
        amount: numAmount,
        transaction_type: modalType === 'payment' ? 'payment' : 'credit',
        notes: notes.trim() || (modalType === 'payment' ? 'Settlement Payment' : 'Grocery Udhaar')
      });
      closeModal();
      fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.detail || "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  const openModal = (customer, type) => {
    setActiveCustomer(customer);
    setModalType(type);
    setAmount('');
    setNotes('');
  };

  const closeModal = () => {
    setActiveCustomer(null);
    setModalType(null);
    setAmount('');
    setNotes('');
  };

  // Calculations
  const totalPendingCredit = customers.reduce((sum, c) => sum + (c.total_credit_balance || 0), 0);
  const activeDebtorsCount = customers.filter(c => c.total_credit_balance > 0).length;

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search))
  );

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      
      {/* Top Header Card with Glassmorphism */}
      <div className="bg-brand-surface/90 backdrop-blur-md rounded-2xl p-5 md:p-6 shadow-sm border border-brand-border transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-brand-teal/10 text-brand-teal">
                <Users size={22} />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-brand-ink font-poppins">{t('khata.title')}</h2>
            </div>
            <p className="text-xs md:text-sm text-brand-muted mt-1">{t('khata.subtitle')}</p>
          </div>

          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="bg-brand-teal text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-md hover:bg-brand-teal-dark active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
          >
            <UserPlus size={18} />
            <span>{t('khata.add_customer')}</span>
          </button>
        </div>

        {/* Financial KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mt-5 pt-5 border-t border-brand-border/60">
          <div className="bg-brand-bg/80 rounded-xl p-3 md:p-4 border border-brand-border">
            <p className="text-[11px] md:text-xs text-brand-muted uppercase font-bold tracking-wider">{t('khata.total_credit')}</p>
            <p className="text-xl md:text-3xl font-extrabold text-brand-danger mt-1 font-poppins">
              ₹{totalPendingCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-brand-bg/80 rounded-xl p-3 md:p-4 border border-brand-border">
            <p className="text-[11px] md:text-xs text-brand-muted uppercase font-bold tracking-wider">{t('khata.active_borrowers')}</p>
            <p className="text-xl md:text-3xl font-extrabold text-brand-amber mt-1 font-poppins">
              {activeDebtorsCount} <span className="text-xs font-normal text-brand-muted">/ {customers.length}</span>
            </p>
          </div>

          <div className="bg-brand-bg/80 rounded-xl p-3 md:p-4 border border-brand-border col-span-2 md:col-span-1 flex items-center justify-between">
            <div>
              <p className="text-[11px] md:text-xs text-brand-muted uppercase font-bold tracking-wider">Khata Recovery Rate</p>
              <p className="text-xl md:text-3xl font-extrabold text-brand-teal mt-1 font-poppins">92.4%</p>
            </div>
            <CheckCircle2 size={32} className="text-brand-teal opacity-70 hidden md:block" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-brand-muted" size={18} />
        <input 
          type="text" 
          placeholder={t('khata.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-brand-surface border border-brand-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal shadow-sm transition-all"
        />
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="animate-spin text-brand-teal" size={36} />
          <p className="text-xs font-semibold text-brand-muted">Loading Khata ledger...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-12 bg-brand-surface rounded-2xl border border-brand-border border-dashed p-6">
          <Users className="mx-auto text-brand-muted mb-2 opacity-50" size={44} />
          <p className="font-semibold text-brand-ink text-base">{t('khata.no_customers')}</p>
          <p className="text-xs text-brand-muted mt-1 mb-4">Add your first customer to start tracking daily Udhaar and settlements.</p>
          <button 
            onClick={() => setIsAddCustomerOpen(true)}
            className="bg-brand-teal text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-teal-dark"
          >
            {t('khata.add_customer')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((customer) => {
            const hasDue = customer.total_credit_balance > 0;
            return (
              <div 
                key={customer.id} 
                className="bg-brand-surface rounded-2xl p-4 md:p-5 border border-brand-border shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Customer Details */}
                <div className="flex items-start space-x-3.5">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm shrink-0 ${
                    hasDue ? 'bg-brand-danger/10 text-brand-danger border border-brand-danger/20' : 'bg-brand-teal/10 text-brand-teal border border-brand-teal/20'
                  }`}>
                    {customer.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-brand-ink text-base leading-snug">{customer.name}</h3>
                    <div className="flex items-center text-xs text-brand-muted space-x-3 mt-0.5">
                      {customer.phone && (
                        <span className="flex items-center">
                          <Phone size={12} className="mr-1" /> {customer.phone}
                        </span>
                      )}
                      <button 
                        onClick={() => openModal(customer, 'history')}
                        className="text-brand-teal font-semibold hover:underline flex items-center"
                      >
                        <Clock size={12} className="mr-1" /> {t('khata.history')} ({customer.khata_transactions?.length || 0})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Balance & Action Buttons */}
                <div className="flex items-center justify-between md:justify-end space-x-3 pt-2 md:pt-0 border-t md:border-t-0 border-brand-border/60">
                  <div className="text-left md:text-right pr-2">
                    <p className="text-[10px] uppercase font-bold text-brand-muted tracking-wider">{t('khata.balance')}</p>
                    <p className={`text-lg md:text-xl font-extrabold font-poppins ${hasDue ? 'text-brand-danger' : 'text-brand-teal'}`}>
                      {hasDue ? `₹${customer.total_credit_balance.toLocaleString('en-IN')}` : t('khata.settled')}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* QR Pay Instant Checkout */}
                    {hasDue && (
                      <button
                        onClick={() => setCheckoutCustomer(customer)}
                        className="px-2.5 py-2 rounded-xl text-xs font-bold bg-brand-bg hover:bg-brand-teal/10 text-brand-teal border border-brand-border hover:border-brand-teal/30 active:scale-95 transition-all flex items-center space-x-1"
                        title="Generate UPI QR for this customer"
                      >
                        <QrCode size={14} />
                        <span className="hidden sm:inline">QR Pay</span>
                      </button>
                    )}

                    {/* Give Credit (Udhaar) */}
                    <button
                      onClick={() => openModal(customer, 'credit')}
                      className="px-3 py-2 rounded-xl text-xs font-bold border border-brand-danger/30 text-brand-danger bg-brand-danger/10 hover:bg-brand-danger/20 active:scale-95 transition-all flex items-center space-x-1"
                      title="Give Credit (उधार दें)"
                    >
                      <Plus size={14} />
                      <span className="hidden sm:inline">{t('khata.give_credit')}</span>
                    </button>

                    {/* Record Payment (जमा) */}
                    <button
                      onClick={() => openModal(customer, 'payment')}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-teal text-white hover:bg-brand-teal-dark active:scale-95 transition-all shadow-sm flex items-center space-x-1.5"
                      title="Record Payment (जमा लें)"
                    >
                      <ArrowDownLeft size={15} />
                      <span>{t('khata.record_payment')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD NEW CUSTOMER (Frosted Glass) */}
      {/* ========================================================================= */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-brand-surface rounded-2xl w-full max-w-md p-6 shadow-2xl border border-brand-border relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setIsAddCustomerOpen(false)}
              className="absolute right-4 top-4 text-brand-muted hover:text-brand-ink"
            >
              <X size={20} />
            </button>

            <div className="flex items-center space-x-2 mb-4">
              <div className="p-2 rounded-xl bg-brand-teal/10 text-brand-teal">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-brand-ink font-poppins">{t('khata.add_customer')}</h3>
                <p className="text-xs text-brand-muted">Create a customer profile for udhaar tracking</p>
              </div>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">{t('khata.name')} *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Ramesh Bhai (Shop #12)"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5 text-sm text-brand-ink focus:ring-2 focus:ring-brand-teal outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">{t('khata.phone')}</label>
                <input 
                  type="text" 
                  placeholder="+91 98765 43210"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5 text-sm text-brand-ink focus:ring-2 focus:ring-brand-teal outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Initial Credit / Udhaar (₹)</label>
                <input 
                  type="number" 
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={newCustomer.initial_credit_balance}
                  onChange={(e) => setNewCustomer({...newCustomer, initial_credit_balance: e.target.value})}
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5 text-sm text-brand-ink focus:ring-2 focus:ring-brand-teal outline-none"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-brand-border font-semibold text-sm text-brand-ink bg-brand-bg hover:bg-brand-border/40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white bg-brand-teal hover:bg-brand-teal-dark shadow-md flex items-center justify-center"
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECORD PAYMENT / GIVE CREDIT (Frosted Glass) */}
      {/* ========================================================================= */}
      {(modalType === 'payment' || modalType === 'credit') && activeCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-brand-surface rounded-2xl w-full max-w-md p-6 shadow-2xl border border-brand-border relative animate-in fade-in zoom-in duration-200">
            <button onClick={closeModal} className="absolute right-4 top-4 text-brand-muted hover:text-brand-ink">
              <X size={20} />
            </button>

            <div className="flex items-center space-x-2.5 mb-4">
              <div className={`p-2.5 rounded-xl ${modalType === 'payment' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-brand-danger/10 text-brand-danger'}`}>
                {modalType === 'payment' ? <ArrowDownLeft size={22} /> : <Plus size={22} />}
              </div>
              <div>
                <h3 className="font-bold text-lg text-brand-ink font-poppins">
                  {modalType === 'payment' ? t('khata.record_payment') : t('khata.give_credit')}
                </h3>
                <p className="text-xs text-brand-muted">
                  Customer: <span className="font-bold text-brand-ink">{activeCustomer.name}</span> (Current Due: ₹{activeCustomer.total_credit_balance})
                </p>
              </div>
            </div>

            <form onSubmit={handleTransaction} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Amount (₹) *</label>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-2.5 text-brand-muted font-bold">₹</span>
                  <input 
                    type="number"
                    step="any"
                    min="1"
                    required
                    autoFocus
                    placeholder="e.g. 500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-xl pl-8 pr-4 py-2.5 text-lg font-bold text-brand-ink focus:ring-2 focus:ring-brand-teal outline-none font-poppins"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Notes / Reason</label>
                <input 
                  type="text" 
                  placeholder={modalType === 'payment' ? "e.g. Paid via UPI / Cash" : "e.g. Rice 5kg, Oil 1L"}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5 text-sm text-brand-ink focus:ring-2 focus:ring-brand-teal outline-none"
                />
              </div>

              {/* Quick Amount Buttons */}
              <div className="flex space-x-2 pt-1">
                {[100, 200, 500, activeCustomer.total_credit_balance].filter(val => val > 0).map((quickVal, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAmount(quickVal.toString())}
                    className="flex-1 py-1 px-2 rounded-lg bg-brand-bg border border-brand-border text-xs font-bold text-brand-ink hover:bg-brand-teal/10 hover:text-brand-teal"
                  >
                    ₹{quickVal}
                  </button>
                ))}
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-xl border border-brand-border font-semibold text-sm text-brand-ink bg-brand-bg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !amount || parseFloat(amount) <= 0}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md flex items-center justify-center ${
                    modalType === 'payment' ? 'bg-brand-teal hover:bg-brand-teal-dark' : 'bg-brand-danger hover:bg-brand-danger/90'
                  } disabled:opacity-50`}
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : (
                    modalType === 'payment' ? 'Confirm Payment (जमा)' : 'Confirm Credit (उधार)'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: TRANSACTION HISTORY (Frosted Glass) */}
      {/* ========================================================================= */}
      {modalType === 'history' && activeCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-brand-surface rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-brand-border relative max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <button onClick={closeModal} className="absolute right-4 top-4 text-brand-muted hover:text-brand-ink">
              <X size={20} />
            </button>

            <div className="mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-brand-teal/10 text-brand-teal">
                  <Receipt size={20} />
                </div>
                <h3 className="font-bold text-lg text-brand-ink font-poppins">{activeCustomer.name}</h3>
              </div>
              <p className="text-xs text-brand-muted mt-1">
                Outstanding Balance: <span className="font-bold text-brand-danger">₹{activeCustomer.total_credit_balance}</span>
              </p>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 divide-y divide-brand-border/60">
              {(!activeCustomer.khata_transactions || activeCustomer.khata_transactions.length === 0) ? (
                <p className="text-center text-xs text-brand-muted py-8">No recorded transactions yet.</p>
              ) : (
                activeCustomer.khata_transactions.map((tx) => {
                  const isCredit = tx.transaction_type === 'credit';
                  return (
                    <div key={tx.id} className="pt-2.5 flex items-center justify-between text-sm">
                      <div className="flex items-start space-x-2.5">
                        <div className={`p-1.5 rounded-lg mt-0.5 ${isCredit ? 'bg-brand-danger/10 text-brand-danger' : 'bg-brand-teal/10 text-brand-teal'}`}>
                          {isCredit ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                        </div>
                        <div>
                          <p className="font-semibold text-brand-ink text-xs md:text-sm">
                            {isCredit ? 'Credit Given (उधार)' : 'Payment Received (जमा)'}
                          </p>
                          <p className="text-[11px] text-brand-muted">{tx.notes || '-'}</p>
                          <span className="text-[10px] text-brand-muted/80">
                            {new Date(tx.date).toLocaleDateString()} at {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <span className={`font-bold font-poppins text-sm md:text-base ${isCredit ? 'text-brand-danger' : 'text-brand-teal'}`}>
                        {isCredit ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-brand-border flex justify-end">
              <button
                onClick={closeModal}
                className="px-5 py-2 bg-brand-bg border border-brand-border rounded-xl font-semibold text-xs text-brand-ink hover:bg-brand-surface"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic UPI QR Checkout for Khata Settlement */}
      {checkoutCustomer && (
        <CheckoutModal
          isOpen={!!checkoutCustomer}
          onClose={() => setCheckoutCustomer(null)}
          initialAmount={checkoutCustomer.total_credit_balance || 100}
          customerName={checkoutCustomer.name}
          onPaymentSuccess={async (paidAmount) => {
            try {
              await axios.post(`http://127.0.0.1:8000/api/khata/${checkoutCustomer.id}/transaction`, {
                amount: paidAmount,
                transaction_type: 'payment',
                notes: 'Settled via Instant UPI QR Code'
              });
              fetchCustomers();
            } catch (err) {
              console.error("Auto-recording payment failed:", err);
            }
          }}
        />
      )}

    </div>
  );
}
