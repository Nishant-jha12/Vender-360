# Vendor360 Offline & Edge Capabilities

Retail operations must continue uninterrupted even when internet connectivity drops.

## 📡 Edge Resilience Strategy
- **Local Catalogue Caching**: Products and barcode indexes stored in IndexedDB for instant lookup.
- **Offline Invoice Queue**: Sales made during outages queue locally and sync with backend upon reconnect.
- **Batch Stock Integrity**: Conflict-free timestamp reconciliation for lot balances.
