Problems I worked on and how they were overcome

### Problem 1 — Backend was not working at all

**What happened:**
The app ran only as a React frontend. All data lived in `src/data/mockData.js`, so there was no API, no database and no way to persist listings, messages or transactions. For submission and demos the project looked incomplete.

**How it was overcome:**
- Created a dedicated `server/` package with **Express + Mongoose**.
- Defined models: `User`, `Listing`, `Message`, `Transaction`, `Review`, `Moderation`, later extended with `Notification`, `Watchlist`, `Payment`, `Upload`.
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
- Enforced **owner-only** edit and delete on listings; owners also cannot bypass a payment reservation.

---

### Problem 5 — Borrow / lend and sale flows had no proper lifecycle

**What happened:**
A single "buy / borrow" record could not represent requests, approvals, returns or extensions, so lenders and borrowers had no way to manage a loan end to end.

**How it was overcome:**
- Built the transaction API: create request, `approve`, update due date, mark `return`, and request an `extend`, with extension history stored on the transaction.
- Added meeting-point agreement from both sides before the exchange, and watchlist, notification and review routes around the flow.

---

### Problem 6 — AI price recommendation had to plug into the marketplace safely

**What happened:**
The FastAPI price-recommendation service existed separately. The marketplace needed to use it during listing creation without breaking when the ML service was slow or offline.

**How it was overcome:**
- Built the ML client and the `/api/ai/price-predict` route in Express so the frontend can request a price recommendation.
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

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| Express API (`server/`) | REST endpoints, models, validation | **Me** |
| MongoDB + Mongoose (incl. memory-server fallback) | Persistent storage, DB connection | **Me** |
| Auth / access middleware | JWT, verified and admin guards, rate limits, ownership rules | **Me** |
| Transaction lifecycle | Request, approve, return, extension endpoints | **Me** |
| ML integration | ML client, price recommendation and formula fallback | **Me** |
| Payments (Razorpay) | Order, verify, webhook, reservation, refund | **Me** |
| Image storage (Cloudinary) | Upload, validation, cleanup, migration | **Me** |

---

## 4. Reflection

The hardest gap was making a **working backend exist at all** when MongoDB was not installed and the frontend was hardwired to mock data. After the Express and Mongoose foundation was in place, the real work became making it trustworthy: locking down who can do what, making payments safe against tampering and double-booking, and connecting the price-recommendation service so the marketplace degrades gracefully instead of failing. This layer supports the rest of the team's features, including verification, pricing and the user interface.
