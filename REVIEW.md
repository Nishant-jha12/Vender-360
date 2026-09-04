# Vendor360 — Code & Product Review

> **Status: addressed in the 4 Sep 2026 rebuild.** Sections 0–6 below have been
> implemented — see the "What changed" section at the bottom of this file, and
> `README.md` for how the app works now. The remaining open items are listed
> there too. This document is kept as the record of what was found and why the
> changes were made.

Reviewed: 4 Sep 2026 · ~5,300 lines · FastAPI + SQLite backend, React 19 + Vite + Tailwind frontend

**Verdict:** the shell is genuinely good — the design system (CSS-variable brand tokens, dark mode,
Material-ish layout) is better than most student projects, and the feature *surface* is wide
(khata, expiry, heatmap, UPI, i18n, voice, OCR). The problem is that the **middle is hollow**:
most of what the app shows is hardcoded or random, nothing records a sale, and the auth is
decorative. Fixing five things below turns this from a clickable mockup into a working product.

---

## 0. The one structural gap

**There is no sale.** Nothing in the app ever records that a customer bought something.

- `CheckoutModal` → "Mark Received" just closes the modal. No DB write, no stock deduction.
- `Transaction` and `Forecast` models exist in `models.py` and are **never written to**.
- So: inventory only ever goes *up*, the sales chart is `random.randint()`, profit is fake,
  the health score is the literal number `78` hardcoded in three files, and the forecast is a
  hardcoded Python list.

Everything else in the app is downstream of this. Add a `Sale` / `SaleItem` model and a billing
flow, and the dashboard, health score, forecast, and expiry pages all start showing real numbers
with almost no extra work.

**Suggested minimum:**

```python
class Sale(Base):
    __tablename__ = "sales"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=True)  # set if udhaar
    payment_mode = Column(String)   # 'cash' | 'upi' | 'khata'
    total_amount = Column(Float)
    total_cost = Column(Float)      # sum of cost_price -> gives real margin
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(String, primary_key=True, default=generate_uuid)
    sale_id = Column(String, ForeignKey("sales.id"))
    item_id = Column(String, ForeignKey("inventory_items.id"))
    qty = Column(Float)
    unit_price = Column(Float)
    unit_cost = Column(Float)
```

`POST /api/sales` → decrement `current_qty`, write the rows, and if `payment_mode == 'khata'`
also create the `KhataTransaction`. Then rewrite `sales-trend`, `health-score` and `forecast`
to query these tables.

---

## 1. Will break right now (fix first)

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | `requirements.txt` is missing `qrcode` and `pillow`. `checkout.py` does `import qrcode` and `main.py` imports it at boot → **fresh clone crashes on `uvicorn main:app`** | `backend/requirements.txt` | add `qrcode[pil]==7.4.2` |
| 2 | `jspdf-autotable` v5 removed the `doc.autoTable()` prototype patch. `Inventory.jsx` uses the v4 API → "Export PDF" throws | `pages/Inventory.jsx:88` | `import autoTable from 'jspdf-autotable'` then `autoTable(doc, {...})` |
| 3 | CORS `allow_origins=["*"]` **with** `allow_credentials=True` is an invalid combination — browsers reject it | `main.py:12` | list `http://localhost:5173` explicitly |
| 4 | Routers registered twice **and** routes carry hardcoded `/api/...` prefixes → garbage paths like `/api/checkout/checkout/generate-upi-qr` and `/api/inventory/api/inventory/expiring-soon` clutter `/docs` | `main.py:26-28`, `inventory.py:103`, `khata.py`, `checkout.py`, `analytics.py` | one decorator per route (relative path), one `include_router` per router |
| 5 | Google map tiles pulled from `mt1.google.com/vt/...` — that's Google's private tile endpoint, outside their ToS, and can break without warning | `pages/Heatmap.jsx:37-56` | use OSM / Carto / MapTiler (you already have `carto_dark` working), or the official Maps JS API with a key |

Verify #2 by actually clicking Export PDF — it's the kind of thing that only shows up at a demo.

---

## 2. Security — currently there is effectively none

This matters the moment you show it to anyone as "a product".

**Anyone can read and modify any store's data.** Every endpoint takes `vendor_id` from the URL
or body and trusts it. Change the ID in the URL and you're in someone else's inventory, khata
and customer phone numbers. `ProtectedRoute` only checks that a localStorage key *exists*.

- `verify_otp` accepts the literal string `"123456"` for **any** vendor_id — `auth.py:74`.
- The "token" returned is `f"mock_token_{vendor.id}"` — not signed, not checked by anything.
- Passwords are **unsalted SHA-256** — `auth.py:11`. A rainbow table breaks these instantly.
- `/api/vendor/{id}` returns the phone number of any vendor you name.

**Fix (about an evening's work):**

```
pip install "python-jose[cryptography]" "passlib[bcrypt]"
```

1. `passlib` CryptContext with bcrypt for `hash_password` / `verify_password`.
2. Issue a real JWT on OTP verify: `{sub: vendor.id, exp: ...}`, signed with a secret from `.env`.
3. Add `get_current_vendor(token = Depends(oauth2_scheme))` and put it on every router.
4. **Delete `vendor_id` from every request signature** — derive it from the token. This one change
   closes the whole class of bug at once.
5. Real OTP: store a random 6-digit code + expiry on the vendor row. Keep `123456` behind a
   `DEBUG_OTP=true` env flag so demos still work.

Also: `vendor360@okaxis` and "Sharma General Store" are hardcoded in `CheckoutModal.jsx:20,39`
and `checkout.py:12-14`. **Every vendor's QR currently pays the same UPI ID.** That is a
money bug, not a cosmetic one. Add `upi_id` and `store_name` to the `Vendor` model, edit them
in Account, and pass them through.

---

## 3. Features that look real but aren't

Users forgive "coming soon". They don't forgive a feature that silently does the wrong thing.

**Voice entry (`inventory.py:167`)** — grabs the first number in the transcript and adds it to
*whatever item happens to be first in the database*, ignoring the words entirely. Say
"sold 5 bread" and it adds 5 milk. It also always *adds*, never subtracts.
→ Fix: fuzzy-match the transcript against `sku_name` (`rapidfuzz`), detect intent keywords
(bika/becha/sold → subtract; aaya/liya/received → add), return a **confirmation payload** the
UI shows before writing. You already have a `confidence` column for exactly this.
Also `VoiceEntry.jsx:24` hardcodes `lang = 'en-IN'` — map it to the i18n language.

**Receipt scan (`ScanReceipt.jsx:59`)** — `setTimeout(2000)` then three hardcoded items. The
camera frame is never captured.
→ Either capture the frame to canvas and run `tesseract.js` client-side, or POST the image to a
backend OCR endpoint. Until then, label it "Demo" in the UI.

**"Search or scan barcode" (`Inventory.jsx:207`)** — there is no scanner, it's a text input.
→ Add `html5-qrcode` or `@zxing/browser`, or change the placeholder text.

**GET endpoints that write fake data.** `GET /api/customers` inserts four invented customers
(khata.py:88) and `GET /api/vendor/test_vendor` creates a vendor (vendor.py:18) when the table
is empty. A real shopkeeper's first login shows "Ramesh Kumar owes ₹1,450".
→ Move to an explicit `POST /api/demo/seed`, or gate on a `DEMO_MODE` env var. GETs should
never mutate.

**Random sales data (`analytics.py:210`)** — the dashboard shows different revenue on every
page refresh. Very noticeable in a demo.

---

## 4. Frontend architecture

**`http://127.0.0.1:8000` is hardcoded in 21 places.** Nothing can be deployed or demoed off
your laptop. This is the highest-value 30-minute fix in the repo:

```js
// src/lib/api.js
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api',
});

api.interceptors.request.use((cfg) => {
  const raw = localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth');
  const token = raw ? JSON.parse(raw).token : null;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(null, (err) => {
  if (err.response?.status === 401) {
    localStorage.removeItem('vendor_auth');
    sessionStorage.removeItem('vendor_auth');
    window.location.href = '/auth';
  }
  return Promise.reject(err);
});
```

Then `.env` with `VITE_API_URL=http://127.0.0.1:8000/api`, and swap all 21 call sites.

**Other structural items:**

- `getAuthData()` is copy-pasted into 10 files. Extract a `useAuth()` hook (or a small context)
  that also exposes `vendor`, `logout()` and the store name.
- Data fetching is bare `useEffect` + `useState` in every page — no caching, no refetch, no
  shared state, and the khata page refetches everything after each transaction. TanStack Query
  would remove ~150 lines and make the app feel instant.
- **12 × `alert()`** for success and failure. Swap for `sonner` or `react-hot-toast` — it's a
  one-line-per-site change and it's the single biggest perceived-polish upgrade.
- **No error states.** Every page does `console.error(err)` and then renders "Loading…" or a
  blank forever. If the backend is down the app looks frozen. Add an `error` state to each
  fetch with a retry button.
- `Heatmap.jsx` is **785 lines** and `KhataDashboard.jsx` is 548. Split the modals, cards and
  the map into `components/`.
- Dead files: `src/App.css`, `src/assets/{react.svg, vite.svg, hero.png}`, and
  `frontend/README.md` (still the Vite boilerplate) — none are imported.

---

## 5. UI / UX polish

Ordered roughly by how much a first-time viewer notices.

1. **Dark-mode flash.** The theme is applied in `useEffect` *after* first paint (`App.jsx:52`),
   so dark-mode users see a white flash on every load. Move it to an inline `<script>` in
   `index.html` that reads `localStorage.theme` before React mounts.
2. **Charts don't follow the theme.** `Dashboard.jsx:103-108` hardcodes `#e5e7eb`, `#9ca3af`,
   `#1a73e8`. In dark mode the grid and axis labels are nearly invisible. Read the CSS variables
   instead (`getComputedStyle(document.documentElement).getPropertyValue('--brand-border')`).
3. **The two hamburger icons do nothing** (`App.jsx:88` and `:120`). Either wire them to
   collapse the sidebar / open a mobile drawer, or remove them — a dead affordance reads as broken.
4. **Score and Heatmap are unreachable on mobile.** The bottom nav filters them out
   (`App.jsx:167`) *by comparing translated strings* — so in Hindi the filter doesn't match and
   all 7 items cram in. Filter on `item.path`, and put the overflow items behind a "More" sheet.
5. **Empty heading over nothing.** `ExpiryAlert` returns `null` when nothing is expiring, but the
   Dashboard still renders the "Critical Expiry Warning" heading above it (`Dashboard.jsx:171`).
   Let the component own its heading, or render an "All good ✓" state.
6. **Hardcoded avatar "A"** (`App.jsx:135`) and a **permanently-red notification dot**
   (`App.jsx:129`) regardless of whether there's anything new.
7. **Hardcoded `78`** health score in `Dashboard.jsx:92` and `Account.jsx:218` — it doesn't even
   read the API value the HealthScore page fetches.
8. **Quantity adjust is +1/-1 only** (`Inventory.jsx:243`). Adding 50 units is 50 clicks. Add a
   number input, and quick chips (+10 / +25 / +50).
9. **You cannot create a product from the UI at all** — only "Seed Fresh Data". No add, no edit
   price/expiry/barcode, no delete. This is the most-missed basic feature in the app.
10. **No loading skeletons** — pages show `'...'` or the text "Loading chart...". Tailwind
    `animate-pulse` placeholder blocks take ten minutes and look dramatically more finished.
11. `Landing.jsx` "Launch App" → `/app` → instantly bounces to `/auth`. Label it "Log in"
    when there's no session.
12. No active-nav state for `/app/scan`, `/app/account`, `/app/notifications` — those pages
    render with nothing highlighted.
13. `focus:outline-none` without a visible replacement ring on several inputs; the sidebar links
    have no keyboard focus style at all. Add `focus-visible:ring-2` for accessibility.

---

## 6. i18n — the headline feature is half-built

You pitch "vernacular voice" on the landing page, and the language switcher is nicely done — but
`i18n.js` has only ~40 keys. **Everything** in Auth, Landing, Legal, Heatmap, ExpiryAlert,
CheckoutModal, VoiceEntry, ScanReceipt and half of Dashboard is hardcoded English. Switching to
हिंदी changes six labels and leaves the rest of the screen in English, which reads worse than not
offering it.

- Extract the remaining strings (probably 150–200 keys). Split resources into
  `locales/en.json`, `hi.json`, `mr.json` instead of one 192-line JS file.
- Add number/currency formatting via `Intl.NumberFormat('en-IN')` — ₹1,45,000 not ₹145000.
  You currently print raw floats (`₹3847.5199999`) in a few places.
- Map the speech-recognition `lang` to the active locale.

---

## 7. Repo hygiene

- **Zero git commits.** `git log` → "does not have any commits yet", everything is staged.
  Commit now, before anything else.
- `backend/app/` contains **only `__pycache__`** from a deleted earlier version (routers for
  `forecast`, `ocr`, `sync`, `network`, `voice` — sources gone). Delete the folder.
- Two stray SQLite files: `backend/vendor360.db` and `backend/app/vendor360.db`. `.gitignore`
  covers `*.db`, so they're untracked — just delete the orphan.
- `backend/package.json` declares `tailwindcss` in the **backend**. Remove it and its lockfile.
- `frontend/dist/` is committed-adjacent build output — ignored correctly, but delete the folder
  so it doesn't go stale.
- `frontend/README.md` is the Vite template. Write a real root `README.md`: what Vendor360 is,
  screenshots, `run.ps1` usage, the `123456` OTP, and the seed step.
- `migrate_step1.py` is a hand-rolled `ALTER TABLE` script. Move to **Alembic** before the schema
  changes again — it'll pay for itself the first time you add the `Sale` table.
- **No tests.** Even six `pytest` + `httpx.AsyncClient` tests over auth, khata balance maths and
  the expiry threshold would catch most regressions. The khata balance logic
  (`max(0.0, balance - amount)`) silently swallows overpayments — worth a test and probably a
  rethink (an overpayment should become a credit, not vanish).

---

## 8. Features worth adding (ranked by value per hour)

1. **Billing / POS screen** — search or scan → cart → total → Cash / UPI / Khata. Writes the
   `Sale`, deducts stock, optionally adds to a customer's udhaar. *This makes every other screen
   in the app real.* Highest priority by a wide margin.
2. **WhatsApp payment reminders** for khata debtors. A `https://wa.me/91XXXXXXXXXX?text=...`
   link with a pre-filled "₹1,450 pending since 12 Aug" message. Zero API cost, zero backend,
   and it's the #1 thing kirana owners actually want from a digital khata.
3. **Discount suggestion for expiring stock.** You already compute `estimated_loss_risk` — turn
   it into "Sell at ₹28 (15% off) to clear before Thursday" with a one-tap price override.
4. **Reorder list.** Items below `reorder_point`, grouped by the wholesaler data you already
   return in the heatmap, exportable as a WhatsApp-able text list.
5. **Day-close summary.** End-of-day card: total sales, cash vs UPI vs udhaar split, top item,
   spoilage. Shopkeepers close their books daily; this is the habit-forming screen.
6. **PWA + offline queue.** `vite-plugin-pwa`, installable to the home screen, and an IndexedDB
   outbox that replays writes when the network returns. You already have an unused `sync_status`
   column — the intent was there. Kirana shops have patchy data; this is a genuine differentiator.
7. **Real forecasting** from your own `Sale` history: 7-day moving average × day-of-week factor,
   plus the festival calendar you already fake. Simple, explainable, and honest — much better
   than a hardcoded list labelled "AI".
8. **Customer statement PDF** — per-customer khata history, since you already ship jsPDF.

---

## Suggested order of work

**Week 1 — make it not lie**
`git commit` → add `qrcode` to requirements → fix the PDF export → collapse the duplicate routes
→ centralise the axios client + `.env` → JWT auth with `get_current_vendor` + bcrypt →
remove the auto-seeding GETs.

**Week 2 — make it work**
`Sale`/`SaleItem` model + billing screen → wire the UPI modal to record the sale → rewrite
sales-trend / health-score / forecast off real rows → add/edit/delete inventory items →
per-vendor UPI ID.

**Week 3 — make it look finished**
Toasts instead of `alert()` → error + skeleton states everywhere → theme-aware charts → fix the
dark-mode flash → finish the i18n extraction → WhatsApp reminders → real README with screenshots.


---
---

# What changed (4 Sep 2026)

## The structural gap is closed

`Sale` and `SaleItem` now exist, and `POST /api/sales` is the spine of the app:
it decrements stock, captures cost-at-time-of-sale so margin stays historically
accurate, writes a `Transaction` audit row, and adds to a customer's khata
balance when the payment mode is credit. A new **Billing** screen drives it —
frequent items one tap away, a live cart, and Cash / UPI / Khata settlement.

`sales-trend`, `health-score`, `forecast`, `day-close` and `reorder-list` are
now queries over those rows. Each returns a `has_data` flag, and the UI shows an
honest empty state instead of a fabricated number.

## Security

- JWT (HS256) issued only after OTP; **every endpoint derives the vendor from
  the token**, and no route accepts a `vendor_id` from the client. Tests cover
  the cross-tenant case that used to be wide open.
- Passwords moved from unsalted SHA-256 to PBKDF2-HMAC-SHA256 (240k iterations,
  per-user salt), with transparent upgrade of old hashes on next login.
- Real one-time codes, hashed and expiring, with the fixed `123456` now behind
  `DEBUG_OTP`.
- CORS restricted to explicit origins.
- Per-vendor `upi_id`: every store's QR used to collect to one hardcoded VPA.
- JWT and hashing use the standard library, so no new dependencies were needed.

## Bugs fixed

- `qrcode`/`pillow` added to requirements, and the import is guarded so a
  missing optional dependency degrades to one 503 rather than failing boot.
- PDF export: `jspdf-autotable` v5 API, **and** `jspdf` v4's named export —
  `import jsPDF from 'jspdf'` was a second latent break. Verified by generating
  a real PDF.
- Khata overpayments become an advance instead of being silently destroyed by
  `max(0.0, balance - amount)`.
- Duplicate router mounts and hardcoded `/api` prefixes removed; the route table
  is now verified clean.
- Voice entry interprets, matches the SKU by fuzzy name, detects add-vs-remove,
  and **asks for confirmation before writing** — it no longer applies a number
  to whichever row came back first.
- GETs no longer write: sample data moved to `POST /api/demo/seed`.
- Mobile nav filtered by translated label, so Score and Heatmap were unreachable
  on a phone and the whole bar broke in Hindi. Now keyed on path, with a More sheet.

## Frontend

- One `lib/api.js` replaces 21 hardcoded `http://127.0.0.1:8000` URLs; token
  injection and 401 handling live in interceptors.
- `AuthContext` replaces `getAuthData()` copy-pasted into ten files, and now
  validates the stored token on boot.
- `useApi` hook gives every page loading, error and retry states — a stopped
  backend no longer looks like a hang.
- Toasts replace all 12 `alert()` calls.
- Theme applied before first paint (no more dark-mode flash); chart colours read
  from CSS variables so they follow the theme.
- Inventory CRUD: add, edit, delete, and a typed quantity input with chips
  instead of the +1/-1 stepper.
- Indian currency formatting throughout.
- Working sidebar toggle, real avatar initials, and a notification badge that
  reflects actual expiring stock.
- Focus-visible rings, ARIA labels, and dialog semantics on modals.

## Honesty pass

Heatmap, and the OCR step of the scan screen, are labelled as sample data /
not-yet-connected. Password reset says it is unavailable rather than showing a
form that does nothing. Google's private tile endpoint (outside their ToS) was
replaced with OpenStreetMap, Carto and OpenTopoMap.

## Verification

- 15 security tests (hashing, salting, legacy upgrade, JWT signature/expiry/
  tampering, `alg: none`) — **run and passing**.
- 25 API tests over stock movement, margin, khata arithmetic, overpayment,
  tenant isolation and auth behaviour — written; run them with
  `pip install -r requirements.txt && python -m pytest`.
- All 26 frontend files parse; all imports and 136 lucide icons resolve; all 27
  frontend API calls map to real backend routes; the route table has no
  duplicate mounts or shadowed paths.

## Still open

Offline/PWA support, Alembic, completing the i18n extraction (billing, auth and
settings are still English-only), real receipt OCR, a barcode scanner, and
splitting `Heatmap.jsx` (still the largest file at ~780 lines).
