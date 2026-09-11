# Vendor360 System Architecture

Vendor360 is an offline-capable, mobile-first store management system built specifically for Indian Kirana stores and small retailers.

## 🏗 High-Level Architecture

```
+----------------------------------------------------------------+
|                   Client Tier (Mobile & Web)                   |
|  - React 19 + Vite + Tailwind CSS v3                           |
|  - ThemeProvider (Light / Dark Mode)                           |
|  - i18n (English, Hindi, Marathi, Bengali)                     |
|  - PWA Web App Manifest + Service Worker Ready                 |
+-------------------------------+--------------------------------+
                                | REST API (JSON / HTTP)
+-------------------------------v--------------------------------+
|                   Backend API (FastAPI)                        |
|  - Uvicorn ASGI Server                                         |
|  - In-Process Token Bucket Rate Limiter                        |
|  - PBKDF2 Password Hashing + HS256 JWT                         |
|  - Stock Batch Engine (FIFO Lot Depletion)                     |
+-------------------------------+--------------------------------+
                                | SQLAlchemy ORM
+-------------------------------v--------------------------------+
|                   Database Tier                                |
|  - SQLite (Local Dev / Edge Deployments)                       |
|  - PostgreSQL (Production / Cloud Deployments)                 |
+----------------------------------------------------------------+
```

## 🔄 Core Data Flows

1. **Quick Billing**: Barcode Scan -> Local Cart -> API `/sales` -> Inventory Lot Depletion -> Khata Update (if Udhaar) -> Thermal Print / WhatsApp Receipt.
2. **Stock Intake**: Barcode / Carton Scan -> Batch Lot Allocation -> Expiry Register -> Purchase History.
3. **Voice Inventory**: Speech Recognition -> Intent Parser -> Stock Adjustment -> Audio Confirmation.
4. **Vernacular Localization**: Centralized JSON dictionaries (`en`, `hi`, `mr`, `bn`) with 100% key parity.
