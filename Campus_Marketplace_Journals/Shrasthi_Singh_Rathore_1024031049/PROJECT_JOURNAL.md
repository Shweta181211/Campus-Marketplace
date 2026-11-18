Problems I worked on and how they were overcome

### Problem 1 — Backend was not working at all

**What happened:**
The app ran only as a React frontend. All data lived in `src/data/mockData.js`, so there was no API, no database and no way to persist listings, messages or transactions. For submission and demos the project looked incomplete.

**How it was overcome:**
- Created a dedicated `server/` package with **Express + Mongoose**.
- Defined models: `User`, `Listing`, `Message`, `Transaction`, `Review`, `Moderation`, later extended with `Notification`, `Watchlist`, `Payment`, `Upload` and `FraudReport`.
- Exposed REST routes under `/api/...` for listings, users, messages, transactions, reviews, moderation and health.

---

### Problem 2 — MongoDB was not installed on the development machine

**What happened:**
`mongod` / `mongosh` and Docker were not available. Connecting only to `mongodb://127.0.0.1:27017` made the API crash on startup, which was a main reason the backend appeared "not working".

**How it was overcome:**
- Added an automatic fallback with **`mongodb-memory-server`**: if local MongoDB is unreachable, an in-memory instance starts so the backend still runs for development and demos.
- Kept `MONGODB_URI` in `server/.env`, so switching to local MongoDB or Atlas is a one-line change (`USE_MEMORY_DB=false`).
- Verified live: the API ran on port `5001` in `memory` mode and the React UI loaded data from it.

---

### Problem 3 — Publishing, chat and buy actions only updated React state

**What happened:**
Sell/Lend kept new items only in memory and refreshing the page wiped them. "Chat with seller" and "Buy / Borrow" were toast-only stubs and stored nothing.

**How it was overcome:**
- `POST /api/listings` creates a document in MongoDB; My Listings loads through `GET /api/listings/mine`; Buy/Borrow and Dashboard refetch from `GET /api/listings`.
- Chat creates a `Message` document and Buy / Borrow creates a `Transaction` document, so the Messages and Transactions pages grow with real use.

---

### Problem 4 — API was open to anyone and had no access rules

**What happened:**
Once data was stored, any request could read or change it. There was no distinction between logged-in, verified and admin users, and no protection against abuse or editing someone else's listing.

**How it was overcome:**
- Added **JWT authentication middleware** with separate guards for logged-in users, verified students and admins. Unverified users cannot load listings and students cannot open admin routes.
- Added **rate limiting** for authentication, OTP requests and general API traffic.
- Enforced **owner-only** edit and delete on listings; owners also cannot lift a fraud hold or a payment reservation.

---

### Problem 5 — Borrow / lend and sale flows had no proper lifecycle

**What happened:**
A single "buy / borrow" record could not represent requests, approvals, returns or extensions, so lenders and borrowers had no way to manage a loan end to end.

**How it was overcome:**
- Built the transaction API: create request, `approve`, update due date, mark `return`, and request an `extend`, with extension history stored on the transaction.
- Added meeting-point agreement from both sides before the exchange, and watchlist, notification and review routes around the flow.

---

### Problem 6 — AI services had to plug into the marketplace safely

**What happened:**
The FastAPI price and fraud services existed separately. The marketplace needed to use them on every listing without breaking when the ML service was slow or offline.

**How it was overcome:**
- Built the ML client and the `/api/ai/price-predict` and `/api/ai/fraud-score` routes in Express.
- Wired fraud screening into listing creation: **HIGH-risk listings are held**, a `Moderation` record is created, and admins approve or reject them through `/api/admin/fraud-alerts` and `/api/admin/listings/:id/review`.
- Added a **formula-based price fallback** (clearly labelled "formula estimate") so listing creation still works if the ML service is down.
- Added live campus **comparables** (median and middle range) when at least four similar listings exist.

---

### Problem 7 — Payments could be tampered with or double-booked

**What happened:**
Taking money safely needs more than a button: the browser could send a fake price, two students could pay for the same item, and a buyer could close the tab right after paying.

**How it was overcome:**
- Implemented **Razorpay** payments where the price is always read from the listing in the database, buyers cannot purchase their own items, and the payment signature is verified on the server. A clearly labelled development mode with an HMAC-signed payload works without keys.
- Added a **signed, idempotent webhook** (captured, failed, order-paid) so payments complete even if the browser never returns.
- Added **15-minute item reservations** so two students cannot pay for one item, automatic release of abandoned checkouts, **automatic refund** when a late payment arrives for an item already sold, and admin-only refunds.

---

### Problem 8 — Listing photos were stored as base64 in the database

**What happened:**
Images embedded as base64 made listings huge, slowed every query and could not be served efficiently.

**How it was overcome:**
- Built an upload API backed by **Cloudinary**: real file-type check using magic bytes, 5 MB and 6-photo limits, resizing to a maximum of 1600 px, and URL-only storage in listings.
- A listing can reference only photos uploaded by the same user; removing a listing deletes its files, and orphan uploads are cleaned up after 24 hours.
- Added a local-disk fallback for development and a `migrate-images` script for old base64 listings.
- Wrote API tests for payments, webhooks, reservations, refunds and uploads.


---

## 2b. Final phase — fraud decision engine, reports and admin backend

### Problem 9 — The API published MEDIUM-risk listings without any extra check

**What happened:**
The API only knew two outcomes: publish or hold. Our specification asks for a third one for MEDIUM risk ("extra verification"), and the fraud model needed many more features than the API was sending.

**How it was overcome:**
- Rewrote `extractFraudFeatures` to send all 22 features, including the AI fair price, photos reused from another seller, other accounts on the same device, outgoing messages in the last hour, open and confirmed reports and listings in the last 24 hours.
- Implemented the **decision engine**: LOW → `active`; MEDIUM → new status `verification`, a 6-digit code is emailed to the seller (`POST /api/listings/:id/verify` and `/verify/resend`); HIGH → `held` with a moderation record.
- Every listing stores the feature snapshot it was scored with, for future supervised training (`npm run export-fraud`).
- Held and unverified listings are invisible to other students, and owners cannot switch them to active themselves.
- A listing is **re-screened when edited**, so an approved listing cannot be turned into a scam later.
- A **rule-based fallback** with the same thresholds keeps screening listings if the ML service is down, and is labelled as such.

---

### Problem 10 — Reused photos could not be detected

**What happened:**
Uploads were stored by URL only, so there was no way to tell that two sellers were using the same photo.

**How it was overcome:**
- The upload route now stores a **SHA-256 hash** of every original file. The fraud features count other sellers' listings and uploads with the same hash.

---

### Problem 11 — Students could not report problems and admins had only one tool

**What happened:**
There was no way to report a scam, an abusive chat message or a no-show, and admins could only approve or reject held listings.

**How it was overcome:**
- Built the **reports API** (`/api/reports`): report a listing, a user, or a chat message (only the recipient can report a message), with duplicate-report protection. Three open reports from different students hide a listing automatically.
- Built the **admin APIs**: confirm or dismiss reports (confirmation increases the accused user's confirmed reports and can remove the listing), **suspend / unsuspend** users (blocked on every request and at login; their listings are hidden and restored), **analytics**, institution **settings** (categories and banned words, enforced on listings and messages), the **audit log** and the fraud-model metrics.
- Added `AuditLog` and `Settings` models and recorded every admin action with actor and reason.

---

### Problem 12 — Price-drop alerts did not exist

**What happened:**
Students could watch items, but nobody was told when a price fell, which our specification lists as a core feature.

**How it was overcome:**
- Watchlist rows now store the last price the watcher saw and an optional threshold (any drop, at least x%, or at least ₹x). When a seller lowers a price, matching watchers get a notification; small drops add up until they cross the threshold.

---

### Problem 13 — The test database did not behave like MongoDB in every case

**What happened:**
Some queries (an update with a hidden-field projection, and certain aggregation operators) worked on real MongoDB but failed in our test environment, which made the new tests unreliable.

**How it was overcome:**
- Replaced those queries with simpler, portable equivalents and gave the seed data realistic dates (accounts and listings in the past), so behavioural fraud features such as "listings in the last hour" stay honest. The backend suite grew to **50 passing API tests**, including 17 new tests for the decision engine, reports, admin tools, alerts and trust.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| Express API (`server/`) | REST endpoints, models, validation | **Me** |
| MongoDB + Mongoose (incl. memory-server fallback) | Persistent storage, DB connection | **Me** |
| Auth / access middleware | JWT, verified and admin guards, rate limits, ownership rules | **Me** |
| Transaction lifecycle | Request, approve, return, extension endpoints | **Me** |
| ML integration + admin moderation | ML client, fraud hold, admin review, price fallback | **Me** |
| Payments (Razorpay) | Order, verify, webhook, reservation, refund | **Me** |
| Image storage (Cloudinary) | Upload, validation, cleanup, migration, SHA-256 content hash | **Me** |
| Fraud decision engine (API side) | Feature extraction, LOW/MEDIUM/HIGH actions, listing verification, re-screening, fallback | **Me** |
| Reports and admin APIs | Reports, auto-hold, suspension, analytics, settings, audit log | **Me** |
| Price-drop alerts | Watch thresholds and notifications | **Me** |

---

## 4. Reflection

The hardest gap was making a **working backend exist at all** when MongoDB was not installed and the frontend was hardwired to mock data. After the Express and Mongoose foundation was in place, the real work became making it trustworthy: locking down who can do what, making payments safe against tampering and double-booking, and connecting the AI services so the marketplace degrades gracefully instead of failing. This layer is what the rest of the team's features (verification, pricing models, fraud detection, UI) depend on.

**Final phase:** the fraud model is only useful if the API acts on it safely. Turning a score into three different listing states, hiding unverified and held listings from everyone except the owner and admins, and recording every admin decision in an audit log made the moderation trustworthy. Building reports, suspension and settings showed me how much of a marketplace's safety is ordinary backend work around the model.
