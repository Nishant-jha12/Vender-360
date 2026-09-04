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

API docs are at http://127.0.0.1:8000/docs

### First run

1. Open http://127.0.0.1:5173 and create an account.
2. At the verification step, `DEBUG_OTP=true` means the code is shown on screen
   (and printed to the backend console). The fixed code `123456` also works.
3. Go to **Account → Load sample data** for a kirana catalogue, four khata
   customers and 30 days of billing history. The history is synthetic, but every
   number the app then shows is computed from those real rows.
4. Add your UPI ID under **Account** to enable UPI checkout.

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
  components/         Toast, States (skeleton/empty/error/demo), ExpiryAlert, CheckoutModal
  pages/              one file per screen

backend
  config.py           settings from .env, with development defaults
  crypto_utils.py     PBKDF2 password hashing + HS256 JWT, standard library only
  security.py         thin wrappers + get_current_vendor dependency
  models.py           SQLAlchemy models
  schemas.py          Pydantic request/response models
  routers/            auth, vendor, inventory, sales, khata, analytics, checkout, demo
  tests/              pytest suites
```

### The data model

`Sale` and `SaleItem` are the spine. Recording a sale decrements stock, writes a
`Transaction` audit row, and — if the payment mode is `khata` — adds to that
customer's balance. `sales-trend`, `health-score`, `forecast` and `day-close`
are all queries over these tables.

### Authentication

Sign in is two steps: password, then a one-time code. Only after the code is
accepted is a signed JWT issued. **Every endpoint derives the vendor from the
token** — no route takes a `vendor_id` from the client.

Passwords use PBKDF2-HMAC-SHA256 (240k iterations, per-user salt). Accounts
created before this change still sign in, and their hash is upgraded silently on
the next successful login.

JWT and password hashing are implemented on the standard library rather than
pulling in PyJWT and bcrypt, so the backend runs with just the core
requirements. Swapping in argon2 later is a contained change in `crypto_utils.py`.

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
| `SECRET_KEY` | random per boot | **Set this.** A rotating key signs everyone out on restart. |
| `DATABASE_URL` | `sqlite:///./vendor360.db` | Point at Postgres when it leaves your laptop. |
| `CORS_ORIGINS` | localhost:5173 | Comma separated. Never `*` — invalid with credentials. |
| `DEBUG_OTP` | `true` | Accepts a fixed code and returns the generated one. Off in production. |
| `DEMO_MODE` | `true` | Gates `/api/demo/seed`. |

Frontend `.env.local`: `VITE_API_URL=http://127.0.0.1:8000/api`

---

## What is real and what is not

The app labels this in the UI, and it is worth being explicit here too.

**Real** — billing and stock movement, khata balances and history, WhatsApp
payment reminders, expiry tracking and clearance pricing, the sales trend, the
health score, the day-close summary, the reorder list, UPI QR generation, and
the day-of-week forecast (once there are 14 days of history).

**Not real yet** — the heatmap's demand zones, wholesalers, competitors and
catchment figures are illustrative sample data (the map itself is real); receipt
OCR is not connected, so the scan screen is a manual-entry form with a camera
preview; and password reset needs an email provider, so it is disabled rather
than pretending to send.

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
  translated; billing, auth and settings are still English-only.
- **UPI confirmation is manual.** Vendor360 cannot see your bank account, so
  "payment received" is something you confirm, not something it detects.
