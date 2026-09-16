# Campus Marketplace

Campus-exclusive buy / borrow / sell / lend app for **verified college emails**. React UI talks to a real Express + MongoDB API. Price and fraud models run in a separate Python FastAPI service trained on **seed data** (not live student trades).

## Architecture

```
React (Vite)  →  Express API (:5001)  →  MongoDB
                         ↓
              Python FastAPI ML (:8000)
              RandomForestRegressor + IsolationForest
```

| Layer | Role |
|--------|------|
| `src/` | React UI (existing paper / washi-tape design) |
| `server/` | Auth, listings, loans, payments, location, notifications |
| `ml-service/` | Price recommendation + fraud anomaly scoring |
| MongoDB | Persistence (local, Atlas, or in-memory fallback) |

## Folder structure

```
src/                 frontend pages + components
server/models/       User, Listing, Transaction, Message, Review, Payment, ...
server/routes/       REST APIs under /api
server/seed.js       demo/seed dataset (isSeed: true)
ml-service/app/      FastAPI app
ml-service/training/ model training
ml-service/data/     seed_listings.csv
```

## Environment variables

Copy `server/.env.example` → `server/.env`.

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 5001) |
| `MONGODB_URI` | MongoDB connection string |
| `USE_MEMORY_DB` | `auto` / `true` / `false` |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `OTP_PEPPER` | OTP hashing pepper |
| `OTP_TTL_MS` | OTP lifetime |
| `OTP_MAX_ATTEMPTS` | Max verify attempts |
| `OTP_RESEND_COOLDOWN_MS` | Resend delay |
| `DEV_RETURN_OTP` | `true` returns OTP in JSON for local tests |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID (Gmail Sign-In) |
| `ALLOWED_COLLEGE_DOMAINS` | Comma-separated, e.g. `campus.edu,thapar.edu` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | Real OTP email |
| `ML_SERVICE_URL` | FastAPI base URL |
| `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET` | Live/test Razorpay |
| `PAYMENT_MODE` | `dev` or omit when Razorpay keys exist |
| `PAYMENT_DEV_SECRET` | HMAC secret for development checkout |
| `CORS_ORIGINS` | Allowed browser origins |
| `SEED_PASSWORD` `SEED_ADMIN_PASSWORD` | Seed account passwords |
| `LOCATION_STALE_MS` | Drop stored location after this many ms |

Frontend optional: `VITE_API_URL` (default `/api`, proxied by Vite).

## Database setup

1. Install MongoDB locally **or** use Atlas in `MONGODB_URI`.
2. If MongoDB is not running, the API starts **mongodb-memory-server** when `USE_MEMORY_DB=auto`.
3. Empty databases auto-seed on first API start.

## Seed / demo data

```bash
npm run seed
```

Creates ~30 verified `@campus.edu` students, ~75 listings (sale + lend), loans, reviews, watchlists, notifications, payments, and high-risk fraud examples. Documents have `isSeed: true`.

Demo logins:

- Student: `riya.sharma@campus.edu` / `CampusDemo123!`
- Admin: `admin@campus.edu` / `CampusAdmin123!`

## How to run

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
npm install --prefix server
npm run server
```

API health: http://localhost:5001/api/health

### ML service

```bash
cd ml-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python training/generate_seed.py
python training/train_price_model.py
# or from project root: npm run ml:train
uvicorn app.main:app --reload --port 8000
```

If FastAPI is down, listing creation still works and the UI shows **AI price recommendation temporarily unavailable.**

## Payment gateway

Without `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` the app uses **development payment mode**:

- Backend still creates a `Payment` + HMAC payload
- UI labels it clearly as not real money
- `POST /api/payments/verify` must succeed or the sale is not marked paid

With Razorpay test keys, checkout uses Razorpay Orders + signature verification.

## College email + Google Sign-In

**Continue with Google** sends you to Google’s account picker (`GET /api/auth/google/start` → Google → `/api/auth/google/callback`). The backend exchanges the auth code, checks `email_verified`, then creates a verified session.

Required in `server/.env`:

```
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/callback
FRONTEND_URL=http://localhost:5174
```

Google Cloud → Credentials → OAuth client (Web):

- Origins: `http://localhost:5173`, `http://localhost:5174`, `http://127.0.0.1:5173`, `http://127.0.0.1:5174`
- Redirect URI: `http://localhost:5001/api/auth/google/callback`

Gmail and allowed college Google accounts (e.g. `@thapar.edu` if it is a Google account) can sign in. Password+OTP remains for seed/demo college emails.

Without client ID **and** secret, tapping Continue with Google shows a setup page. Restart `npm run server` after editing `.env`.

## Location

Off by default (`Enable nearby marketplace discovery` on Profile). Exact lat/lng is never returned on listing APIs. Nearby results show `~1.2 km away`. Meeting point text is only returned after **both** borrower and lender agree (`PUT /api/transactions/:id/meeting`).

## API overview

All marketplace routes (except `/api/health`, `/api/auth/*`, `/api/categories`) require `Authorization: Bearer <jwt>` and a **verified** college email.

- Auth: `GET /api/auth/google/start` `GET /api/auth/google/callback` `POST /api/auth/google` `register` `verify` `login` `logout`
- Listings: `GET/POST /api/listings` `GET/PUT/DELETE /api/listings/:id` `GET /api/listings/mine`
- AI: `POST /api/ai/price-predict` `POST /api/ai/fraud-score`
- Location: `PUT /api/location/preferences` `PUT /api/location` `GET /api/location/nearby`
- Messages: `GET/POST /api/messages` `GET /api/messages/:conversationId`
- Transactions: `POST /api/transactions` `POST .../approve` `PUT .../due-date` `PUT .../return` `POST .../extend`
- Watchlist: `GET/POST /api/watchlist` `DELETE /api/watchlist/:listingId`
- Notifications: `GET /api/notifications` `PUT /api/notifications/:id/read`
- Payments: `POST /api/payments/create-order` `verify` `GET /api/payments/:id`
- Trust: `GET /api/users/:id/trust-score`
- Admin: `GET /api/admin/fraud-alerts` `PUT /api/admin/listings/:id/review`

## Testing

```bash
npm run lint
npm run build
npm run test:api
```

ML after training: `curl -s http://127.0.0.1:8000/health`

### Manual checklist

1. Register with `user@gmail.com` + password → use Google Sign-In instead.
2. Register `@campus.edu` or `@thapar.edu` → OTP → verify → marketplace.
3. Login as Riya → browse Buy/Borrow, search, open a listing.
4. Sell/Lend: fill original price, condition, age, brand → AI range appears → set your own asking price → publish.
5. Profile → enable nearby discovery → allow browser location → Buy/Borrow “Nearby only”.
6. Request to borrow → lender (other seed user) approves on Loans & payments → due label → request extension → mark returned → lender confirms → COMPLETED.
7. Buy now → checkout. Without Razorpay keys, use **Simulate signed success** (HMAC verified on server). Invalid signature fails.
8. Admin login → Fraud review → approve/reject held listings.
9. Unverified users cannot load listings (401/403). Students cannot open admin alerts (403).

## Known limitations

- **Google OAuth**: without `GOOGLE_CLIENT_ID`, Continue with Google is disabled. Create a Web client ID in Google Cloud.
- **SMTP**: without `SMTP_*`, OTP is not emailed (console / `DEV_RETURN_OTP`).
- **Razorpay**: without keys, money is not collected; architecture is ready for test keys.
- **MongoDB Atlas**: optional; local or in-memory works.
- **ML**: trained on `seed_listings.csv`, not real campus trades. Metrics are written to `ml-service/models_store/price_metrics.json`.
- No map API key is required (browser Geolocation + geohash only).
