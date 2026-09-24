# Vendor360 Hardware Integration Guide

Vendor360 works with standard retail POS peripherals and mobile devices out-of-the-box.

---

## 🔊 1. UPI Soundbox Simulation
Vendor360 includes a built-in software UPI Soundbox eliminating expensive monthly hardware rental fees:
- **Audio Synthesizer**: Web Audio API generates signature dual-tone electronic chimes directly via the device speaker with zero external audio assets.
- **Multilingual Voice Announcements**: Web Speech API delivers crystal-clear payment announcements in Hindi (`hi-IN`), Marathi (`mr-IN`), Bengali (`bn-IN`), and English (`en-IN`).
- **Real-Time Push**: Triggered instantaneously via Server-Sent Events (`/checkout/stream`) or secure webhook reconciliation.
- **Physical Speaker Pairing**: Pair any inexpensive Bluetooth or 3.5mm counter speaker to the store tablet/phone for loud ambient retail announcements.

---

## 🖨 2. Thermal Receipt Printers
- **Supported Standards**: USB and Bluetooth 58mm (2-inch) and 80mm (3-inch) ESC/POS thermal printers.
- **Browser Print Drivers**: Clean, high-contrast, paper-optimized receipts rendered via CSS print media queries.
- **Quick Print**: Automatically prints invoice on sale finalization without opening system dialogs when configured with kiosk printing.

---

## 📷 3. Barcode Scanners
- **USB / Bluetooth Scanners**: Standard HID keyboard wedge scanners require no drivers. Scanned barcodes trigger automatic product addition to cart.
- **Mobile Camera Scanner**: High-speed camera scanner powered by WebRTC and ZXing library for instant carton and SKU scanning directly on smartphones.
