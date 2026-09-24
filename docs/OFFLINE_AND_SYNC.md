# Vendor360 Offline & Edge Capabilities

Retail operations must continue uninterrupted even when internet connectivity drops. Vendor360 implements an offline-first architecture to protect store sales and cashflow.

---

## 📡 1. Offline Architecture & Multi-Tenancy
- **Scoped IndexedDB (`vendor360_offline_db` v2)**:
  - `products`: Cached product catalogue for instant offline search and barcode scanning.
  - `customers`: Cached khata customer ledger balances.
  - `sales_outbox`: Queued offline sales indexed by `vendor_id` and `created_at`.
  - Scoping ensures multiple store accounts on a shared tablet cannot leak or mix customer or transaction data.
- **Client-Side Identity Minting (`offline_id`)**:
  - The client generates a unique UUID `offline_id` (`off-...`) before submitting a transaction.
  - Preserved across network retries, online submissions, and offline outbox queuing.
- **Server Idempotency Guard**:
  - The backend enforces a compound unique constraint on `(vendor_id, offline_id)`.
  - Re-submitting an already processed sale safely returns the existing sale without double-depleting inventory or double-charging accounts.

---

## 🔄 2. Background Sync & Reconciliation
- **Periodic & Event-Driven Replay**:
  - The `SyncContext` monitors `navigator.onLine` and `window` online events.
  - Upon reconnection, pending sales are flushed in bulk via `POST /sales/sync-batch`.
- **Failure Transparency**:
  - Unprocessable sales (e.g. malformed items) are returned in the `failed` batch list and flagged in IndexedDB.
  - The frontend Sync Center displays failed sales with exact rejection reasons, allowing manual correction rather than silent loss.

---

## ⚡ 3. Service Worker Shell Caching
- **Cache Strategy (`vendor360-shell-v2`)**:
  - Pre-caches core application shell (`/`, `/app`, `/index.html`, `/manifest.json`).
  - Stale-while-revalidate for same-origin static assets (JS bundles, CSS, fonts, SVG icons).
  - Explicit network-first for `/api/*` requests with informative `503 Service Unavailable` JSON fallbacks when offline.
