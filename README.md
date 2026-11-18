# Campus Marketplace

Campus-exclusive buy / borrow / sell / lend app for **verified college emails**. React UI talks to a real Express + MongoDB API. Price and fraud models run in a separate Python FastAPI service trained on **seed data** (not live student trades).

## Architecture

```
React (Vite)  →  Express API (:5001)  →  MongoDB
                         ↓
              Python FastAPI ML (:8000)
              GradientBoosting price model + IsolationForest fraud model
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
| `RAZORPAY_WEBHOOK_SECRET` | Verifies Razorpay webhooks (`/api/payments/webhook`) |
| `PAYMENT_RESERVATION_MINUTES` | How long an item is held while a buyer checks out (default 15) |
| `CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME` `CLOUDINARY_API_KEY` `CLOUDINARY_API_SECRET` | Cloud image storage. Empty = local-disk dev storage |
| `CLOUDINARY_FOLDER` `MAX_IMAGE_MB` `STORAGE_PROVIDER` `PUBLIC_API_URL` | Storage tuning |
| `PAYMENT_MODE` | `dev` or omit when Razorpay keys exist |
| `PAYMENT_DEV_SECRET` | HMAC secret for development checkout |
| `CORS_ORIGINS` | Allowed browser origins |
| `SEED_PASSWORD` `SEED_ADMIN_PASSWORD` | Seed account passwords |
| `LOCATION_STALE_MS` | Drop stored location after this many ms |
| `LOCATION_ENC_KEY` | 64 hex chars; AES-256-GCM key for stored user coordinates (derived from `JWT_SECRET` if empty) |
| `MAX_ACCOUNTS_PER_DEVICE` | Sign-ups allowed from one browser/device before new ones are refused (default 3) |
| `PRICE_DROP_EMAILS` | `true` also emails price-drop alerts (in-app alerts are always on) |

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

## Payment gateway (Razorpay)

Without Razorpay keys the app runs in **development payment mode** (clearly labelled, no money moves, but the server still verifies an HMAC-signed payload). With `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (use `rzp_test_...` keys first) the UI opens real Razorpay Checkout (UPI / cards / netbanking).

How it works:

1. `POST /api/payments/create-order` — the **price is read from the listing in the database** (any amount sent by the browser is ignored). You cannot buy your own item. The listing is atomically **reserved** for the buyer (default 15 min) so two students cannot pay for the same item; abandoned checkouts are released automatically.
2. Razorpay Checkout → browser calls `POST /api/payments/verify` → server checks the signature → item becomes `sold`, buyer and seller are notified.
3. **Webhook** `POST /api/payments/webhook` (set it up in Razorpay Dashboard → Webhooks with `RAZORPAY_WEBHOOK_SECRET`; events `payment.captured`, `payment.failed`, `order.paid`) completes the payment even if the buyer closes the tab right after paying. Finalisation is idempotent.
4. If a payment completes after the item was sold to someone else, it is refunded automatically. Admins can refund with `POST /api/payments/:id/refund`.
5. `GET /api/payments` lists a user's payments (as buyer or seller); the *Loans & payments* page shows the history.

Local webhook testing: use a tunnel (e.g. `ngrok http 5001`) and point the Razorpay webhook at `https://<tunnel>/api/payments/webhook`.

## Cloud image storage (Cloudinary)

1. Create a free Cloudinary account, copy the **API environment variable** (`CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD`) into `server/.env`, restart the API.
2. Photos are uploaded as soon as the seller picks them (`POST /api/uploads/images`, multipart). The server checks the real file type (magic bytes), enforces 5 MB / 6 photos, resizes to max 1600 px in Cloudinary, and returns URLs. Listings store **only URLs**, never base64.
3. A listing can only reference photos uploaded by the same user. Editing/removing a listing deletes the files from the cloud; uploads never attached to a listing are cleaned up after 24 h.
4. Without Cloudinary credentials the API falls back to `server/uploads/` (dev only — not durable on hosts with ephemeral disks). `GET /api/uploads/status` and the upload box say which one is active.
5. Old listings that still contain base64 images: `npm run migrate-images`.

## Optional location sharing (privacy-first)

Two independent opt-ins, both off by default:

- **Buyer**: Profile → *Enable nearby marketplace discovery* (browser permission). Lets *you* filter by distance. Stored for at most 7 days, deleted when you turn it off.
- **Seller**: per listing, tick *Show this item in “nearby” searches* when publishing, or toggle it later in *My listings*. The stored point is blurred by 80–220 m; exact coordinates are never returned by any API. Buyers see only `~1.2 km away`.

Nearby search (`GET /api/listings?nearby=true&radiusKm=3`) is computed in the API (bounding box + haversine), so it works on any MongoDB and combines with category / price / condition filters. Meeting points are still shared only after both sides agree.

## Price recommendation model

`ml-service/` trains and serves the model; the Express API calls it on every listing and in `POST /api/ai/price-predict`.

- **Target**: `log(price / original MRP)` (scale-free), so a ₹900 calculator and a ₹40,000 laptop are learned on the same scale.
- **Features**: MRP, age, condition, demand, category, item class from the title (phone, laptop, textbook, …), brand tier, sale vs lend and lend unit.
- **Model**: three HistGradientBoosting quantile regressors (10 % / 50 % / 90 %) with **monotone constraints** (older never costs more, better condition never costs less). The median is the suggested price; the fair band is calibrated with conformalised quantile regression to ≈80 % coverage.
- **Results** (held-out test set, `ml-service/models_store/price_metrics.json`): MAPE ≈ 8.7 % vs ≈ 44 % for a naive condition-average baseline; band coverage ≈ 79 %.
- **Model comparison** (PDF section 5, same split): Linear Regression MAPE 17.2 % · Random Forest 9.0 % · Gradient Boosting (served) 8.7 %. RF and GBM are about equally accurate; GBM is served because it supports monotone constraints and quantile loss (the fair band). MAE, RMSE and R² are all in the metrics file.
- The API passes the model's answer through unchanged. If the ML service is down, a formula fallback is used and labelled “formula estimate” in the UI. If ≥ 4 similar listings exist, live campus comparables (median / middle half) are shown next to the estimate.

**Honest limitation:** the training data is *synthetic* (realistic depreciation curves + noise), because no real sales exist yet. The numbers above measure how well the model learns that behaviour, **not** real market accuracy. As students complete purchases, run:

```bash
npm run export-training   # real paid sales -> server/data/export-training.json
npm run ml:train          # retrains, real rows weighted 5x
```

The ML service also retrains automatically at start-up if its model file is missing or from an incompatible scikit-learn.

## Fraud / scam detection model (PDF sections 6-7)

Code: `ml-service/app/services/fraud_features.py`, `fraud_model.py`, `training/generate_fraud_data.py`, `training/train_fraud_model.py`; Node side `server/utils/ai.js`.

**22 features at three levels**, built by the API for every new listing (`extractFraudFeatures`):

| Level | Features |
|---|---|
| Listing | price vs. **AI fair price** (from the pricing model), price vs. median of *comparable* campus listings, discount on expensive items, short title/description, duplicate title (same seller, or anyone in 24 h), copy-pasted description, no photos, **photos reused from another seller** (SHA-256 of the uploaded file), phone/UPI/“pay outside the app” text, urgency words |
| User | account age, email verified, **linked accounts on the same device** (hashed `X-Device-Id`), confirmed reports, open reports, trust score |
| Behavioural | listings in the last hour / 24 h, outgoing-message spike, transaction spike |

**Model.** Isolation Forest (400 trees, unsupervised — no fraud labels exist on day one, as the PDF says). Every feature is *risk-oriented and one-sided-clipped*, so an unusually **good** account (4 years old, long description) can never look anomalous. The raw anomaly score is calibrated to a 0-1 **Fraud Risk Score** with percentile anchors from the training data.

**Decision engine.** `LOW < 0.40` → publish · `0.40-0.70 MEDIUM` → **extra verification**: listing is hidden until the seller enters a 6-digit code emailed to their college address · `≥ 0.70 HIGH` → **hold + admin review**. Price deviation is only one of 22 inputs: a 30 % cheaper iPhone from a trusted seller stays LOW (tested). Each score comes with **explanations** (occlusion: “how much does the risk drop if this one feature looked normal?”), shown to admins and sellers. If the ML service is down, a rule-based fallback with the same thresholds is used and labelled `heuristic`.

**Results** on 3 600 held-out synthetic rows with injected scams (`models_store/fraud_metrics.json`): ROC-AUC ≈ 0.997 · MEDIUM+HIGH recall ≈ 92 % at precision ≈ 85 % · HIGH precision 100 % · false alarms on honest students < 1 % (vs 7 % for “any red flag” rules). Guardrail: two or more independent red flags always get at least MEDIUM. Per-pattern detection (price bait, spam duplicates, multi-account, repeat offender, stolen photos, activity spike) is in the admin console → *AI models*.

**Honest limitation:** like the price model, it is trained on *simulated* campus behaviour; the numbers show it separates the simulated scam patterns, not real-world accuracy.

**Learning from admins (stage 2).** Every listing stores the feature snapshot it was scored with. Admin decisions become labels:

```bash
npm run export-fraud   # rejected / confirmed-report = 1, approved / sold cleanly = 0 -> server/data/fraud-training.json
npm run ml:train       # with >= 10 of each label a RandomForestClassifier is trained and blended 50/50
```

## Reports, admin console, trust score

- **Reports**: students report a listing, a user, or a **chat message** (only the recipient can). 3 open reports hide a listing automatically. Admin *confirms* (accused trust drops, can remove the listing) or *dismisses* (listing restored).
- **Admin console** (`/admin`): fraud alerts with risk meter + reasons, reports, users (search, **suspend/unsuspend** — suspended users are logged out and their listings hidden), analytics (users, listings by status/category/risk, overdue loans, payments), **settings** (banned words for listings + chat, enable/disable/add categories), AI model metrics, audit log.
- **Trust score** follows the PDF formula `T = 10 + 20·V + 25·R + 20·C + 15·O + 10·A − 40·F` (0-100). Confirmed reports weigh 1.0, admin-upheld flags 0.5, open complaints only 0.15. The profile shows each component; every change is written to the **audit trail** with a reason.
- **Price-drop alerts**: watchers get an in-app notification when the price falls below the last price they saw; optional thresholds (any / ≥ x % / ≥ ₹x) set from the listing page.
- **Avatar builder**: face, skin, hair, hair colour, outfit, colour, accessory, background — stored as a small JSON object, drawn as SVG.
- **Privacy**: exact user coordinates are AES-256-GCM encrypted at rest; only geohash-rounded positions are used for discovery.

## PDF feature coverage

| PDF section | Where |
|---|---|
| 3 College email verification, duplicate-account detection, rate limiting | `routes/auth.js`, `utils/device.js`, `middleware/rateLimit.js` |
| 3.1 Avatar identity | `components/AvatarBuilder.jsx`, `PUT /api/users/me` |
| 4 Optional location (opt-in, geohash, blur, encrypted, expiry) | `routes/location.js`, `utils/geohash.js`, `utils/locationCrypto.js` |
| 5 AI price range + confidence + reason; LR/RF/GBM comparison | `ml-service/training/train_price_model.py` |
| 6 Fraud model (Isolation Forest → RF on admin labels) | `ml-service/training/train_fraud_model.py` |
| 7 Combined decision engine (LOW/MEDIUM/HIGH) | `server/utils/ai.js`, `POST /ai/assess-listing` (ML service) |
| 8 Borrow/lend due dates, reminders, extensions, lender-confirmed return | `routes/transactions.js`, `utils/loans.js` |
| 9 Price-drop alerts with thresholds | `utils/priceAlerts.js`, `routes/watchlist.js` |
| 10 Trust score formula + bands | `utils/trust.js` |
| 13 Key APIs | see API overview |
| 14 Security: RBAC, admin-only routes, signed uploads, chat abuse reports, audit trail | `middleware/auth.js`, `routes/reports.js`, `models/AuditLog.js` |

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

## API overview

All marketplace routes (except `/api/health`, `/api/auth/*`, `/api/categories`) require `Authorization: Bearer <jwt>` and a **verified** college email.

- Auth: `GET /api/auth/google/start` `GET /api/auth/google/callback` `POST /api/auth/google` `register` `verify` `login` `logout`
- Listings: `GET/POST /api/listings` `GET/PUT/DELETE /api/listings/:id` `GET /api/listings/mine` `POST /api/listings/:id/verify` `POST /api/listings/:id/verify/resend`
- AI: `POST /api/ai/price-predict` `POST /api/ai/fraud-score` (ML service also exposes `POST /ai/assess-listing`, `GET /ai/model-info`, `GET /ai/fraud-model-info`)
- Location: `PUT /api/location/preferences` `PUT /api/location` `GET /api/location/nearby`
- Messages: `GET/POST /api/messages` `GET /api/messages/:conversationId`
- Transactions: `POST /api/transactions` `POST .../approve` `PUT .../due-date` `PUT .../return` `POST .../extend`
- Watchlist: `GET/POST /api/watchlist` `PUT /api/watchlist/:listingId` (alert threshold) `DELETE /api/watchlist/:listingId`
- Reports: `POST /api/reports` `GET /api/reports/mine`
- Profile: `PUT /api/users/me` `GET /api/users/avatar-options`
- Notifications: `GET /api/notifications` `PUT /api/notifications/:id/read`
- Payments: `GET /api/payments/config` `GET /api/payments` `POST /api/payments/create-order` `verify` `webhook` `:id/refund` (admin) `GET /api/payments/:id`
- Uploads: `GET /api/uploads/status` `POST /api/uploads/images` `DELETE /api/uploads/images/:id`
- Listing location: `PUT /api/listings/:id/location`
- Trust: `GET /api/users/:id/trust-score`
- Admin: `GET /api/admin/fraud-alerts` `PUT /api/admin/listings/:id/review` `GET /api/admin/reports` `PUT /api/admin/reports/:id` `GET /api/admin/users` `PUT /api/admin/users/:id/suspend` `GET /api/admin/analytics` `GET/PUT /api/admin/settings` `GET /api/admin/audit` `GET /api/admin/fraud-model`

## Testing

```bash
npm run lint
npm run build
npm run test:api   # 50 API tests (uploads, payments, location, price wiring, fraud engine, reports, admin, alerts, trust)
npm run test:ml    # 17 model tests: 8 price + 9 fraud (needs the ML python deps)
```

ML after training: `curl -s http://127.0.0.1:8000/health`

### Manual checklist

1. Register with `user@gmail.com` + password → use Google Sign-In instead.
2. Register `@campus.edu` or `@thapar.edu` → OTP → verify → marketplace.
3. Login as Riya → browse Buy/Borrow, search, open a listing.
4. Sell/Lend: add photos (they upload immediately), fill original price, condition, age, brand → AI range appears → set your own asking price → publish.
5. Profile → enable nearby discovery → allow browser location. Publish an item with “Show in nearby searches” ticked → Buy/Borrow “Nearby only” (drag the radius).
6. Request to borrow → lender (other seed user) approves on Loans & payments → due label → request extension → mark returned → lender confirms → COMPLETED.
7. Buy now → checkout. Without Razorpay keys, use **Simulate signed success** (HMAC verified on server). Invalid signature fails.
8. Sell an item with “urgent, pay advance on whatsapp 98xxxxxxxx” and a price far below the AI range → held (HIGH). Admin login → Admin console → Fraud alerts shows the score, reasons and signals → approve / reject.
9. A MEDIUM listing shows **needs verification** in My listings → enter the emailed code (shown on screen in dev mode) → it goes live.
10. Watch an item, set “drop of at least 10 %”, lower its price as the seller → notification appears.
11. Report a listing / chat message → Admin console → Reports → confirm → accused trust score drops (Profile → score history).
12. Admin → Users → suspend a student → they are logged out and their listings are hidden; unsuspend restores them.
13. Unverified users cannot load listings (401/403). Students cannot open admin alerts (403).

## Known limitations

- **Google OAuth**: without `GOOGLE_CLIENT_ID`, Continue with Google is disabled. Create a Web client ID in Google Cloud.
- **SMTP**: without `SMTP_*`, OTP is not emailed (console / `DEV_RETURN_OTP`).
- **Razorpay**: not tested here with real keys (dev mode + signed webhook payloads only). Try `rzp_test_` keys first.
- **Cloudinary**: the SDK calls are covered by stubbed tests; try it with your own free account.
- **MongoDB Atlas**: optional; local or in-memory works.
- **ML**: trained on synthetic data until real sales exist (see above).
- No map API key is required (browser Geolocation + geohash only).
