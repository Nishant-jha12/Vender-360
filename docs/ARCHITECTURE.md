# Vendor360 System Architecture

Vendor360 is an offline-capable, mobile-first store management system built specifically for Indian Kirana stores and small retailers.

---

## 🏗 High-Level Architecture

```
+----------------------------------------------------------------+
|                   Client Tier (Mobile & Web)                   |
|  - React 19 + Vite + Tailwind CSS v3                           |
|  - ThemeProvider (Light / Dark Mode)                           |
|  - i18n (English, Hindi, Marathi, Bengali - 100% Parity)       |
|  - IndexedDB v2 Multi-Tenant Outbox & Local Storage            |
|  - Software UPI Soundbox (Web Audio Synthesizer + Web Speech)  |
|  - Service Worker Shell Cache (vendor360-shell-v2)             |
+-------------------------------+--------------------------------+
                                | REST API + SSE Stream
+-------------------------------v--------------------------------+
|                   Backend API (FastAPI)                        |
|  - Uvicorn ASGI Server                                         |
|  - In-Process Token Bucket Rate Limiter (Login, Reset, API)    |
|  - PBKDF2 Password Hashing (600,000 Iterations) + HS256 JWT    |
|  - Stock Batch Engine (FIFO Lot Depletion & Spoilage Tracking) |
|  - UPI Checkout Engine (HMAC Webhook + SSE Broadcaster)        |
|  - Shop Timezone Utilities (Asia/Kolkata Business Day Bounds)  |
+-------------------------------+--------------------------------+
                                | SQLAlchemy ORM
+-------------------------------v--------------------------------+
|                   Database Tier                                |
|  - SQLite (Local Dev / Edge Deployments)                       |
|  - PostgreSQL (Production / Cloud Deployments)                 |
+----------------------------------------------------------------+
```

---

## 🔄 Core Data Flows

1. **Quick Billing**: Barcode Scan -> Local Cart -> API `POST /sales` (with `offline_id` idempotency) -> FIFO Inventory Batch Depletion -> Khata Update (if Udhaar) -> Thermal Print / Receipt.
2. **UPI Soundbox & Auto-Reconciliation**: Dynamic QR Intent -> Customer UPI Payment -> Bank Webhook (HMAC-SHA256) -> Server-Sent Event (`/checkout/stream`) -> Synthesized Chime & Vernacular Voice Announcement -> Instant Sale Completion.
3. **Offline Resilience**: Network Drop -> Local Outbox Queue -> Reconnect -> Batch Sync (`POST /sales/sync-batch`) -> Conflict-Free Lot Depletion & Ledger Replay.
4. **Goods Intake**: Barcode / Carton Scan -> Batch Lot Allocation -> Expiry Risk Classifier -> Monthly GST Purchase Register.
5. **Vernacular Localization**: Centralized JSON dictionaries (`en`, `hi`, `mr`, `bn`) with 100% key parity enforced by automated CI validation.
