/**
 * Vendor360 IndexedDB Offline Storage Engine
 *
 * Provides resilient, zero-dependency offline persistence for:
 * 1. Product catalogue & quick-tap frequent items.
 * 2. Khata customer directory & balances.
 * 3. Sales Outbox for offline billing transactions.
 */

const DB_NAME = 'vendor360_offline_db';
const DB_VERSION = 2;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;

      // 1. Products Catalogue
      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'id' });
        prodStore.createIndex('sku_name', 'sku_name', { unique: false });
        prodStore.createIndex('barcode', 'barcode', { unique: false });
      }

      // 2. Frequent Billing Items
      if (!db.objectStoreNames.contains('frequent')) {
        db.createObjectStore('frequent', { keyPath: 'id' });
      }

      // 3. Customers & Khata Balances
      if (!db.objectStoreNames.contains('customers')) {
        const custStore = db.createObjectStore('customers', { keyPath: 'id' });
        custStore.createIndex('name', 'name', { unique: false });
      }

      // 4. Sales Outbox
      let outboxStore;
      if (!db.objectStoreNames.contains('sales_outbox')) {
        outboxStore = db.createObjectStore('sales_outbox', { keyPath: 'offline_id' });
        outboxStore.createIndex('created_at', 'created_at', { unique: false });
        outboxStore.createIndex('synced_status', 'synced_status', { unique: false });
        outboxStore.createIndex('vendor_id', 'vendor_id', { unique: false });
      } else {
        outboxStore = tx.objectStore('sales_outbox');
        if (!outboxStore.indexNames.contains('vendor_id')) {
          outboxStore.createIndex('vendor_id', 'vendor_id', { unique: false });
        }
      }

      // 5. Metadata (last sync time, etc.)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
  });
}

function generateOfflineId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `off-${crypto.randomUUID()}`;
  }
  return `off-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// --------------------------------------------------------------------------
// Products & Catalogue Caching
// --------------------------------------------------------------------------
export async function cacheProducts(items = []) {
  if (!items || !items.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    items.forEach((item) => {
      if (item && item.id) store.put(item);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getCachedProducts(searchTerm = '') {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const req = store.getAll();

    req.onsuccess = () => {
      const all = req.result || [];
      if (!searchTerm || searchTerm.trim().length < 2) {
        resolve(all.slice(0, 30));
        return;
      }
      const term = searchTerm.trim().toLowerCase();
      const filtered = all.filter((item) => {
        const nameMatch = item.sku_name && item.sku_name.toLowerCase().includes(term);
        const barcodeMatch = item.barcode && item.barcode.toLowerCase().includes(term);
        const catMatch = item.category && item.category.toLowerCase().includes(term);
        return nameMatch || barcodeMatch || catMatch;
      });
      resolve(filtered.slice(0, 30));
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

// --------------------------------------------------------------------------
// Frequent Items Caching
// --------------------------------------------------------------------------
export async function cacheFrequent(items = []) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('frequent', 'readwrite');
    const store = tx.objectStore('frequent');
    store.clear();
    items.forEach((item) => {
      if (item && item.id) store.put(item);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getCachedFrequent() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('frequent', 'readonly');
    const store = tx.objectStore('frequent');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// --------------------------------------------------------------------------
// Customers Caching
// --------------------------------------------------------------------------
export async function cacheCustomers(customers = []) {
  if (!customers || !customers.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readwrite');
    const store = tx.objectStore('customers');
    customers.forEach((c) => {
      if (c && c.id) store.put(c);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getCachedCustomers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readonly');
    const store = tx.objectStore('customers');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// --------------------------------------------------------------------------
// Offline Sales & Outbox Management
// --------------------------------------------------------------------------
export async function saveOfflineSale({
  offline_id = null,
  vendor_id = null,
  payment_mode,
  customer_id = null,
  customer_name = null,
  items = [],
  note = null,
}) {
  const db = await openDB();
  const assignedOfflineId = offline_id || generateOfflineId();
  const createdAt = new Date().toISOString();

  const total_amount = items.reduce(
    (sum, line) => sum + (line.qty || 0) * (line.unit_price || 0),
    0,
  );

  const saleRecord = {
    offline_id: assignedOfflineId,
    vendor_id,
    payment_mode,
    customer_id,
    customer_name,
    note,
    items,
    total_amount: Math.round(total_amount * 100) / 100,
    created_at: createdAt,
    synced_status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sales_outbox', 'products', 'frequent', 'customers'], 'readwrite');

    // 1. Put in outbox
    const outboxStore = tx.objectStore('sales_outbox');
    outboxStore.put(saleRecord);

    // 2. Decrement local stock in products and frequent stores
    const prodStore = tx.objectStore('products');
    const freqStore = tx.objectStore('frequent');

    items.forEach((line) => {
      if (!line.item_id) return;

      const pReq = prodStore.get(line.item_id);
      pReq.onsuccess = () => {
        const prod = pReq.result;
        if (prod) {
          prod.current_qty = Math.max(0, (prod.current_qty || 0) - line.qty);
          prodStore.put(prod);
        }
      };

      const fReq = freqStore.get(line.item_id);
      fReq.onsuccess = () => {
        const freq = fReq.result;
        if (freq) {
          freq.current_qty = Math.max(0, (freq.current_qty || 0) - line.qty);
          freqStore.put(freq);
        }
      };
    });

    // 3. Update customer local khata balance if khata sale
    if (payment_mode === 'khata' && customer_id) {
      const custStore = tx.objectStore('customers');
      const cReq = custStore.get(customer_id);
      cReq.onsuccess = () => {
        const cust = cReq.result;
        if (cust) {
          cust.total_credit_balance = Math.round(((cust.total_credit_balance || 0) + total_amount) * 100) / 100;
          custStore.put(cust);
        }
      };
    }

    tx.oncomplete = () => {
      resolve({
        id: assignedOfflineId,
        offline_id: assignedOfflineId,
        vendor_id,
        payment_mode,
        total_amount: saleRecord.total_amount,
        customer_id,
        note,
        created_at: createdAt,
        is_offline: true,
        line_items: items.map((line) => ({
          sku_name: line.sku_name || 'Item',
          qty: line.qty,
          unit_price: line.unit_price,
          line_total: Math.round(line.qty * line.unit_price * 100) / 100,
        })),
      });
    };

    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getPendingSales(vendorId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales_outbox', 'readonly');
    const store = tx.objectStore('sales_outbox');
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      const pending = all.filter(
        (s) => s.synced_status === 'pending' && (!vendorId || s.vendor_id === vendorId)
      );
      pending.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      resolve(pending);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getFailedSales(vendorId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales_outbox', 'readonly');
    const store = tx.objectStore('sales_outbox');
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      const failed = all.filter(
        (s) => s.synced_status === 'failed' && (!vendorId || s.vendor_id === vendorId)
      );
      failed.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      resolve(failed);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getPendingCount(vendorId = null) {
  const pending = await getPendingSales(vendorId);
  return pending.length;
}

export async function markSalesSynced(syncedOfflineIds = []) {
  if (!syncedOfflineIds || !syncedOfflineIds.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales_outbox', 'readwrite');
    const store = tx.objectStore('sales_outbox');
    syncedOfflineIds.forEach((id) => {
      store.delete(id);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function markSaleFailed(offline_id, reason = 'Unknown sync error') {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales_outbox', 'readwrite');
    const store = tx.objectStore('sales_outbox');
    const req = store.get(offline_id);
    req.onsuccess = () => {
      const sale = req.result;
      if (sale) {
        sale.synced_status = 'failed';
        sale.sync_error = reason;
        store.put(sale);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function purgeForLogout() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'frequent', 'customers', 'meta'], 'readwrite');
    tx.objectStore('products').clear();
    tx.objectStore('frequent').clear();
    tx.objectStore('customers').clear();
    tx.objectStore('meta').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function removePendingSale(offline_id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales_outbox', 'readwrite');
    const store = tx.objectStore('sales_outbox');
    store.delete(offline_id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --------------------------------------------------------------------------
// Metadata Storage (Last sync, etc.)
// --------------------------------------------------------------------------
export async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = (e) => reject(e.target.error);
  });
}
