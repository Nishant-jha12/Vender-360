# Vendor360 REST API Reference

The backend exposes RESTful endpoints with automatic OpenAPI documentation available at `/docs`.

## 🔐 Authentication
- `POST /auth/login`: Form-based identifier and password login.
- `POST /auth/verify-otp`: Step-up challenge token verification.
- `POST /auth/logout`: Revokes active session.
- `POST /auth/forgot-password`: Issues timed reset link.

## 📦 Stock & Catalogue
- `GET /products`: Filterable product catalogue with barcode lookup.
- `POST /products`: Create new SKU with lot expiry dates.
- `GET /stock/expiry-alerts`: Retrieve items approaching expiry within 7/30 days.

## 🧾 Billing & Sales
- `POST /sales`: Finalize customer invoice and deplete inventory lots.
- `GET /sales/today`: Daily sales and margin summary.

## 📒 Digital Khata
- `GET /khata`: List customers and outstanding debt ledger.
- `POST /khata/{id}/transactions`: Record credit or payment entries.
