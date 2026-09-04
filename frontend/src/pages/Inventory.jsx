import { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Search, Plus, Loader2, Download, FileText, Barcode, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';
import ExpiryAlert from '../components/ExpiryAlert';

export default function Inventory() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [qty_change, setQtyChange] = useState(0);
  const [updateLoading, setUpdateLoading] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      if(!authData?.vendor_id) return;
      
      const res = await axios.get(`http://127.0.0.1:8000/api/inventory/${authData.vendor_id}`);
      setItems(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const seedDatabase = async () => {
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      await axios.post(`http://127.0.0.1:8000/api/inventory/seed?vendor_id=${authData?.vendor_id}`);
      fetchInventory();
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualUpdate = async () => {
    if (!editingItem) return;
    setUpdateLoading(true);
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      await axios.post('http://127.0.0.1:8000/api/inventory/manual-update', {
        vendor_id: authData?.vendor_id,
        item_id: editingItem.id,
        qty_change: qty_change
      });
      fetchInventory();
      setEditingItem(null);
      setQtyChange(0);
    } catch (err) {
      alert("Failed to update");
    } finally {
      setUpdateLoading(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Vendor360 Inventory & Expiry Audit Report", 14, 15);
    
    const tableColumn = ["Item Name", "Category", "Quantity", "Cost Price", "Selling Price", "Expiry Date", "Barcode"];
    const tableRows = [];

    items.forEach(item => {
      const rowData = [
        item.sku_name,
        item.category,
        `${item.current_qty} ${item.unit}`,
        `Rs ${item.cost_price}`,
        `Rs ${item.selling_price}`,
        item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A',
        item.barcode || 'N/A'
      ];
      tableRows.push(rowData);
    });

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save("vendor360_inventory_report.pdf");
  };

  const exportCSV = () => {
    const csvData = items.map(item => ({
      ItemName: item.sku_name,
      Category: item.category,
      Quantity: item.current_qty,
      Unit: item.unit,
      CostPrice: item.cost_price,
      SellingPrice: item.selling_price,
      ExpiryDate: item.expiry_date ? new Date(item.expiry_date).toISOString().split('T')[0] : '',
      Barcode: item.barcode || ''
    }));
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "vendor360_inventory.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredItems = items.filter(i => 
    i.sku_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.barcode && i.barcode.includes(search))
  );

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-ink font-poppins">{t('inventory.title')}</h2>
          <p className="text-xs text-brand-muted">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={exportCSV} className="text-xs bg-brand-surface border border-brand-border px-3.5 py-2 rounded-xl font-semibold text-brand-ink flex items-center shadow-sm hover:bg-brand-bg transition-colors">
            <FileText size={15} className="mr-1.5" /> {t('inventory.export_csv')}
          </button>
          <button onClick={exportPDF} className="text-xs bg-brand-teal text-white px-3.5 py-2 rounded-xl font-semibold flex items-center shadow-sm hover:bg-brand-teal-dark transition-colors">
            <Download size={15} className="mr-1.5" /> {t('inventory.export_pdf')}
          </button>
        </div>
      </div>

      {/* Expiry Alert Tracker Component */}
      <ExpiryAlert compact={false} />

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-brand-muted" size={18} />
        <input 
          type="text" 
          placeholder="Search items by name or scan barcode..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-brand-surface border border-brand-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal shadow-sm transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-brand-teal" size={36} />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-brand-surface rounded-2xl border border-brand-border border-dashed p-6">
          <Package className="mx-auto text-brand-muted mb-3 opacity-50" size={44} />
          <p className="text-brand-ink font-bold text-base">Your inventory is empty</p>
          <p className="text-xs text-brand-muted mt-1 mb-4">Seed test Kirana items to test expiry dates and barcodes</p>
          <button onClick={seedDatabase} className="bg-brand-teal text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md hover:bg-brand-teal-dark">
            Seed Fresh Data & Expiry Dates
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isNearExpiry = item.expiry_date && new Date(item.expiry_date) <= new Date(Date.now() + 7 * 86400000);
            return (
              <div key={item.id} className="bg-brand-surface rounded-2xl p-4 md:p-5 border border-brand-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:shadow-md">
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="font-bold text-brand-ink text-sm md:text-base">{item.sku_name}</p>
                    {isNearExpiry && (
                      <span className="text-[10px] bg-brand-danger/15 text-brand-danger px-2 py-0.5 rounded-md font-extrabold uppercase">
                        Expiring Soon
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-brand-muted bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border/60">
                      {item.category}
                    </span>
                    <span className="text-[11px] bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-md font-bold">
                      CP: ₹{item.cost_price} | SP: ₹{item.selling_price}
                    </span>
                    {item.expiry_date && (
                      <span className="text-[11px] text-brand-muted flex items-center">
                        <Calendar size={11} className="mr-1 text-brand-muted" /> 
                        {new Date(item.expiry_date).toLocaleDateString()}
                      </span>
                    )}
                    {item.barcode && (
                      <span className="text-[10px] font-mono text-brand-muted flex items-center bg-brand-bg px-1.5 py-0.5 rounded border border-brand-border">
                        <Barcode size={12} className="mr-1" /> {item.barcode}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end space-x-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-brand-border/60">
                  <div className="text-right">
                    <p className={`font-extrabold font-poppins text-lg md:text-xl ${item.current_qty <= item.reorder_point ? 'text-brand-danger' : 'text-brand-ink'}`}>
                      {item.current_qty}
                    </p>
                    <p className="text-[10px] uppercase font-bold text-brand-muted">{item.unit}</p>
                  </div>
                  
                  <button 
                    onClick={() => { setEditingItem(item); setQtyChange(0); }}
                    className="w-9 h-9 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center text-brand-ink hover:bg-brand-teal/10 hover:text-brand-teal active:scale-95 transition-all shadow-sm"
                    title="Adjust stock quantity"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Update Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-brand-surface rounded-2xl w-full max-w-xs p-6 shadow-2xl border border-brand-border animate-in zoom-in duration-200">
            <h3 className="font-bold text-brand-ink mb-1">Adjust Quantity</h3>
            <p className="text-sm text-brand-muted mb-4">{editingItem.sku_name}</p>
            
            <div className="flex items-center justify-between bg-brand-bg rounded-xl p-2 mb-6 border border-brand-border">
              <button onClick={() => setQtyChange(q => q - 1)} className="w-10 h-10 flex items-center justify-center bg-brand-surface rounded-lg font-bold text-xl active:scale-95 shadow-sm">-</button>
              <span className="font-bold text-xl font-poppins px-4">
                {qty_change > 0 ? `+${qty_change}` : qty_change}
              </span>
              <button onClick={() => setQtyChange(q => q + 1)} className="w-10 h-10 flex items-center justify-center bg-brand-teal text-white rounded-lg font-bold text-xl active:scale-95 shadow-sm">+</button>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => setEditingItem(null)} className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-brand-ink bg-brand-bg border border-brand-border">Cancel</button>
              <button onClick={handleManualUpdate} disabled={updateLoading || qty_change === 0} className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white bg-brand-teal disabled:opacity-50">
                {updateLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
