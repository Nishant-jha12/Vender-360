# Vendor360 REST API Reference

The backend exposes RESTful endpoints with automatic OpenAPI interactive documentation available at `/docs` (when `ENABLE_DOCS=true`).

---

## 🔐 Authentication (`/auth`)
- `POST /auth/signup`: Register a new store owner account.
- `POST /auth/login`: Form-based identifier and password login (returns challenge token).
- `POST /auth/verify-otp`: Step-up challenge token verification (mints JWT session token).
- `POST /auth/resend-otp`: Request fresh 6-digit challenge code.
- `POST /auth/forgot-password`: Rate-limited password reset link issuance.
- `POST /auth/reset-password`: Single-use token-based password reset.
- `POST /auth/logout`: Revokes active session.
- `GET /auth/me`: Current vendor profile and configuration.

---

## 📦 Inventory & Catalogue (`/inventory`)
- `GET /inventory`: Filterable product catalogue with search and barcode lookup.
- `POST /inventory`: Create new SKU catalogue item.
- `GET /inventory/{id}`: Detailed product info including active stock batches.
- `PUT /inventory/{id}`: Update catalogue metadata with optimistic concurrency (`last_updated`).
- `DELETE /inventory/{id}`: Archive an inventory item.
- `POST /inventory/{id}/adjust`: Adjust stock levels with recorded audit rationale.
- `GET /inventory/expiring-soon`: Retrieve items approaching expiry within days threshold.
- `GET /inventory/barcode/{code}`: Quick barcode resolver.
- `POST /inventory/voice-log`: Process voice transcript stock movement.

---

## 🧾 Billing & Sales (`/sales`)
- `POST /sales`: Finalize customer invoice with FIFO lot depletion (supports client-minted `offline_id` for idempotency).
- `POST /sales/sync-batch`: Synchronize queued offline sales with batch idempotency and error reporting.
- `GET /sales`: Paginated sales history with date and payment method filters.
- `GET /sales/day-close`: Shop-timezone day summary of sales, margins, and payment breakdown.
- `POST /sales/{id}/void`: Void a sale, restock inventory batches, and record compensating ledger reversals.

---

## 📒 Digital Khata Ledger (`/khata`)
- `GET /khata`: List customers with outstanding credit/advance ledger balances.
- `POST /khata`: Create a new khata customer.
- `GET /khata/{id}`: Customer ledger statement and transaction history.
- `POST /khata/transactions`: Record credit sale or payment recovery entries.
- `DELETE /khata/{id}`: Delete a settled customer (blocked if non-zero balance).

---

## 🔊 UPI Payments & Soundbox (`/checkout`)
- `POST /checkout/create-intent`: Mint dynamic UPI QR payment intent with vendor VPA.
- `GET /checkout/intent/{txn_ref}/status`: Poll payment completion status.
- `GET /checkout/stream`: Server-Sent Events (SSE) stream for real-time `payment_completed` soundbox pushes.
- `POST /checkout/webhook`: HMAC-SHA256 authenticated UPI aggregator webhook for automatic reconciliation.
- `POST /checkout/simulate-payment`: Demo-mode simulator to trigger payment completion (available only when `DEMO_MODE=true`).
- `GET /checkout/recent-payments`: List recent UPI transactions for reconciliation logs.

---

## 🚚 Goods Intake & Purchase Register (`/intake`)
- `POST /intake/start`: Initialize a new delivery intake session.
- `POST /intake/scan`: Scan incoming carton or product barcode with expiry validation.
- `POST /intake/confirm`: Finalize delivery intake and ingest stock lots.
- `GET /intake/register`: GST purchase register breakdown for a specified month (`YYYY-MM`).
- `DELETE /intake/{session_id}/line/{line_id}`: Remove line item from an open intake session.
