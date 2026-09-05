# Vendor360

Billing, inventory and digital khata for neighbourhood retail shops.

A shopkeeper bills a customer in a few taps, stock updates itself, udhaar is
tracked per customer, and every figure on the dashboard is computed from those
bills. Nothing is estimated or invented.

---

## Running it

You need Python 3.10+ and Node 18+.

```bash
# Backend  (http://127.0.0.1:8000)
cd backend
pip install -r requirements.txt
cp .env.example .env          # then set SECRET_KEY
python migrate.py             # only needed if you have an existing vendor360.db
uvicorn main:app --reload --port 8000

# Frontend (http://127.0.0.1:5173)
cd frontend
npm install
npm run dev
```

On Windows, `run.ps1` starts both.

Or with containers, which brings Postgres along:

```bash
cp backend/.env.example backend/.env    # then edit it
docker compose up --build               # api on :8000, web on :8080
```

API docs are at http://127.0.0.1:8000/docs

### First run

1. Open http://127.0.0.1:5173 and create an account.
2. At the verification step, `DEBUG_OTP=true` means the code is shown on screen
   (and printed to the backend console). The fixed code `123456` also works.
3. Go to **Account → Load sample data** for a kirana catalogue, four khata
   customers and 30 days of billing history. The history is synthetic, but every
   number the app then shows is computed from those real rows.
4. Add your UPI ID under **Account** to enable UPI checkout, and your GSTIN
   there if you want stock-intake summaries to print as input-tax records.

> Set `DEBUG_OTP=false` and a real `SECRET_KEY` before running this anywhere
> other than your own machine.

---

## How it works

```
frontend/src
  lib/api.js          axios instance, token injection, 401 handling
  lib/format.js       Indian currency and date formatting
  context/            AuthContext — the single source of session state
  hooks/useApi.js     fetch + loading/error/retry
  hooks/useChartTheme small helper so charts follow light/dark
  hooks/useBarcodeScanner  camera scanning on the browser's own BarcodeDetector
  components/         Toast, States (skeleton/empty/error/demo), ExpiryAlert,
                      CheckoutModal, ModalShell, IntakeItemSheet, IntakeSummary
  lib/intakePdf.js    the goods-received note, as a PDF
  pages/              one file per screen

backend
  config.py           settings from .env, and the production safety check
  notifications.py    delivery of one-time codes and reset links
  ratelimit.py        in-process rate limiting for the auth endpoints
  stock.py            batch-level stock: the only place quantity moves
  crypto_utils.py     PBKDF2 password hashing + HS256 JWT, standard library only
  security.py         thin wrappers + get_current_vendor dependency
  models.py           SQLAlchemy models
  schemas.py          Pydantic request/response models
  routers/            auth, vendor, inventory, sales, intake, khata, analytics,
                      checkout, demo
  tests/              pytest suites
```

### Stock intake

`Sale` takes stock out; **stock intake** puts it back in. The scan screen reads a
barcode with the camera (or a USB scanner, or typing), and what happens next
depends on how the product arrives from the wholesaler:

- **Loose / single** — one scan is one unit, added to stock immediately. There
  is nothing worth asking about.
- **Carton / box** — one scan is a whole case, so it stops and shows what is in
  the box (`units_per_pack`, cost, batch, expiry) to be checked against the
  actual carton before anything is written. Confirming can write the pack size
  and dates back onto the product, so the next delivery scans with nothing to
  type.

An unrecognised barcode says so and offers to create the product, rather than
guessing at a match.

Everything scanned in one delivery is a `StockIntake` session. Stock moves as
each line is added, not at the end, so a phone that dies mid-delivery has not
lost the counting already done; undoing a line takes the stock back off again.
Closing the session produces a goods-received note — every line with its batch,
MFD/EXP, rate and HSN, totalled and split by GST rate into CGST and SGST — which
prints or saves as a PDF for the input-tax claim.

That document only calls itself a tax record when it is one. With no GSTIN saved
on the store (**Account → GSTIN**), or no GST on the items, it prints as a plain
stock record and says why.

### The data model

`Sale` and `SaleItem` are the spine. Recording a sale decrements stock, writes a
`Transaction` audit row, and — if the payment mode is `khata` — adds to that
customer's balance. `sales-trend`, `health-score`, `forecast` and `day-close`
are all queries over these tables.

### Authentication

Sign in is two steps, and they are **cryptographically chained**. A correct
password returns a short-lived *challenge token*; the one-time code step
consumes that token, not an account id from the client. Only after the code is
accepted is a session JWT issued. **Every endpoint derives the vendor from the
token** — no route takes a `vendor_id` from the client.

That chaining is the fix for a real hole: `verify-otp` used to accept a
`vendor_id` straight from the caller, and `resend-otp` needed no authentication
at all. Anyone holding an account id could ask for a fresh code and then guess
six digits with no limit, so the password was decorative.

Passwords use PBKDF2-HMAC-SHA256 (240k iterations, per-user salt). Accounts
created before this change still sign in, and their hash is upgraded silently on
the next successful login.

JWT and password hashing are implemented on the standard library rather than
pulling in PyJWT and bcrypt, so the backend runs with just the core
requirements. Swapping in argon2 later is a contained change in `crypto_utils.py`.

### Security

| Control | Where |
|---|---|
| Two-factor chained by a signed challenge token | `routers/auth.py` |
| Tokens carry a `purpose`, so a half-finished login is not a session | `crypto_utils.py` |
| Per-account `token_epoch` — a password change or `/api/auth/logout-all` kills every existing token | `security.py` |
| OTP dies after 5 wrong guesses | `OTP_MAX_ATTEMPTS` |
| Rate limits on login, signup and the OTP step, by IP *and* by account | `ratelimit.py` |
| Constant-time login, so timing does not reveal which accounts exist | `routers/auth.py` |
| CSP, HSTS, `X-Frame-Options`, `nosniff`, `no-referrer`, `Cache-Control: no-store` | `main.py` |
| Request body ceiling and bounded list inputs | `MAX_REQUEST_BYTES`, `max_length` |
| Errors return a reference, never a traceback | `main.py` |
| Tenant isolation on every query, covered by tests | `_owned_*` helpers |
| Single-use password reset links that end every session | `routers/auth.py` |
| No third-party font, analytics or CDN request at runtime | self-hosted `public/fonts` |
| CSP and cache headers on the static frontend too | `frontend/nginx.conf` |

**Unsafe settings are opt-in, and production refuses them.** `DEBUG_OTP` and
`DEMO_MODE` now default to *off*. Set `APP_ENV=production` and the app checks its
own configuration at startup — an unset `SECRET_KEY`, `DEBUG_OTP`, `DEMO_MODE`,
disabled rate limiting or a plain-HTTP CORS origin each stop it booting rather
than quietly serving. `/docs` is disabled there too, and `/api/health` reports
only `{"status": "ok"}` — it used to advertise whether the fixed OTP was live.

Known limits, stated plainly:

- **The session token is held in browser storage**, so a cross-site scripting bug
  would expose it. The app renders no user HTML and uses no `dangerouslySetInnerHTML`,
  and the 12-hour lifetime plus `logout-all` limit the damage — but httpOnly
  cookies with CSRF tokens would be strictly better, and are the next step.
- **Rate limiting is in-process.** It stops scripted brute force against one
  server; more than one instance needs a shared store such as Redis.
- **You must connect a delivery provider.** Codes and reset links go through
  `notifications.py`: set `NOTIFY_PROVIDER=http` with `NOTIFY_HTTP_URL` pointing at
  MSG91, Twilio, Gupshup or your own gateway. Production refuses to start without
  one, because a code nobody receives means nobody can sign in.
- **Fonts are self-hosted.** Run `npm run fonts` once in `frontend/` to fetch Inter
  and Roboto into `public/fonts`. Until you do, the app falls back to the system
  font stack. It never loads them from Google, which would hand every visitor's IP
  address and User-Agent to a third party before they had even signed in.
- **Data is not encrypted at rest.** Customer names and phone numbers sit in plain
  SQLite; use full-disk or database-level encryption wherever this is deployed.

---

## Tests

```bash
cd backend
python -m pytest tests/test_crypto.py   # standard library only, no install needed
python -m pytest                        # full suite (needs requirements.txt)
```

`test_crypto.py` covers password hashing, salting, legacy-hash upgrades, and JWT
signature/expiry/tampering (including the `alg: none` bypass).

`test_api.py` covers the paths where being wrong costs money — stock movement,
margin arithmetic, khata balances, overpayments — plus the tenant isolation that
stops one shop reading another's data.

---

## Configuration

Backend `.env` (see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `development` | `production` makes startup refuse any unsafe setting below. |
| `SECRET_KEY` | random per boot | **Set this.** A rotating key signs everyone out on restart. |
| `DATABASE_URL` | `sqlite:///./vendor360.db` | Point at Postgres when it leaves your laptop. |
| `CORS_ORIGINS` | localhost:5173 | Comma separated. Never `*` — invalid with credentials. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | 12 hours. There is no per-token revocation, only `logout-all`. |
| `DEBUG_OTP` | `false` | Accepts a fixed code for **any** account. Development only. |
| `DEMO_MODE` | `false` | Gates `/api/demo/seed`, which deletes the caller's data first. |
| `ENABLE_DOCS` | on outside production | `/docs` publishes the whole API surface. |
| `RATE_LIMIT_ENABLED` | `true` | Turning this off is refused in production. |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong guesses before the code is destroyed. |
| `MAX_REQUEST_BYTES` | `1048576` | Largest accepted request body. |

`run.ps1` and `backend/.env.example` set `DEBUG_OTP=true` and `DEMO_MODE=true`
so the local flow works without an SMS provider. Both are development-only, and
`APP_ENV=production` will not start with either.

Frontend `.env.local`: `VITE_API_URL=http://127.0.0.1:8000/api`

---

## What is real and what is not

The app labels this in the UI, and it is worth being explicit here too.

**Real** — billing and stock movement, barcode stock intake with batch-level
(first-expiry-first) stock, its printable goods-received note, the delivery
history and monthly purchase register, khata balances and history, WhatsApp payment reminders,
expiry tracking and clearance pricing, the sales trend, the health score, the
day-close summary, the reorder list, UPI QR generation, and the day-of-week
forecast (once there are 14 days of history).

**Not real yet** — the heatmap's demand zones, wholesalers, competitors and
catchment figures are illustrative sample data (the map itself is real);
receipt OCR is not connected, so a wholesale bill is still counted in by
scanning or typing rather than read from a photo; and password reset needs an
email provider, so it is disabled rather than pretending to send.

Barcode scanning uses the browser's built-in `BarcodeDetector`, which Chrome on
Android has and Safari and Firefox do not. Where it is missing the camera still
opens for aiming and the screen says to type the number instead — a USB scanner
types it for you.

Voice logging is real, but it interprets first and asks you to confirm before
writing anything.

---

## Known limitations

- **SQLite and no migrations tool.** `migrate.py` adds missing columns in place;
  move to Alembic before the schema changes much further.
- **Online only.** A shop with patchy signal cannot bill offline yet. An
  IndexedDB outbox plus `vite-plugin-pwa` is the obvious next step, and
  `InventoryItem.sync_status` is already there for it.
- **i18n is partial.** The nav, dashboard, inventory and khata screens are
  translated; billing, stock intake, deliveries, auth and settings are still
  English-only.
- **UPI confirmation is manual.** Vendor360 cannot see your bank account, so
  "payment received" is something you confirm, not something it detects.
