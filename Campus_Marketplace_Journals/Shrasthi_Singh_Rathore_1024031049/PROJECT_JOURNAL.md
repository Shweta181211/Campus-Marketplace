# Campus Marketplace — Project Journal

**Student:** Shrasthi Singh Rathore (1024031049)
**Group:** 3C73, BE Third Year, CSE
**Course:** UCS503 - Software Engineering
**Project:** Campus Marketplace (Buy / Borrow / Sell / Lend web app)
**Stack:** React (Vite) frontend · Express.js API · MongoDB (Mongoose)
**My focus this phase:** Core backend setup — API, database connection, and persistence for listings and transactions.

---

## 1. Project goal

Build a campus marketplace where students can browse listings, sell or lend items, view messages and transactions, manage a profile with trust scores, and (for admins) review a moderation queue. The UI existed first as a frontend-only prototype; this phase made the **backend and MongoDB fully functional**. My part of this phase covered getting a real API and database in place and making listing/transaction actions actually persist.

---

## 2. Problems I worked on and how they were overcome

### Problem 1 — Backend was not working at all

**What happened:**
Until this phase, the app ran only as a React frontend. All data lived in `src/data/mockData.js`. There was no API server, no database, and no way to persist new listings, messages, or transactions. For submission and demos, "backend not working" meant the project looked incomplete and could not store real usage data.

**How it was overcome:**
- Created a dedicated `server/` package with **Express + Mongoose**.
- Defined models: `User`, `Listing`, `Message`, `Transaction`, `Review`, `Moderation`.
- Exposed REST routes under `/api/...` (listings, users, messages, transactions, reviews, moderation, health).
- Connected every major page to the API via `src/api.js` so Buy/Borrow, Sell/Lend, My Listings, Messages, Transactions, Profile, and Admin all read/write MongoDB instead of hardcoded arrays.

---

### Problem 2 — MongoDB was not installed on the development machine

**What happened:**
`mongod` / `mongosh` were not available locally, and Docker was also missing. Connecting only to `mongodb://127.0.0.1:27017` would make the API crash on startup. This was one of the main reasons the backend appeared "not working" during earlier attempts.

**How it was overcome:**
- Added automatic fallback with **`mongodb-memory-server`**: if local MongoDB is unreachable, the server starts an in-memory MongoDB instance so the backend still runs for development and demos.
- Kept a real URI in `server/.env` (`MONGODB_URI`) so installing MongoDB Community / Atlas later is a one-line change (`USE_MEMORY_DB=false` or simply having mongod running).
- Verified live: API on port `5001` connected in `memory` mode, and the React UI loaded that data from MongoDB.

---

### Problem 3 — Publishing a listing only updated React state

**What happened:**
Sell/Lend previously called `onPublish` and kept the new item only in memory. Refreshing the page wiped it.

**How it was overcome:**
- `POST /api/listings` creates a document in MongoDB (with seller = current user Riya, fair-price band, category metadata).
- My Listings loads via `GET /api/listings/mine`.
- Buy/Borrow and Dashboard refetch from `GET /api/listings`.

---

### Problem 4 — Chat / buy actions were toast-only stubs

**What happened:**
"Chat with seller" and "Buy / Borrow" only showed a toast; nothing was stored.

**How it was overcome:**
- Chat creates a `Message` document.
- Buy / Borrow creates a `Transaction` document.
- Messages and Transactions pages load from MongoDB so the history grows with use.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| Express API (`server/`) | REST endpoints, models, validation | **Me** |
| MongoDB + Mongoose (incl. memory-server fallback) | Persistent storage, DB connection | **Me** |
| Listing / Message / Transaction persistence | Publish, chat, buy/borrow actions saving to DB | **Me** |

---

## 4. Reflection

My part of the hardest gap was making a **working backend exist at all** when MongoDB wasn't installed locally and the frontend was still hardwired to mock data. Standing up the Express + Mongoose server, wiring the models and routes, adding the in-memory MongoDB fallback, and making publish/chat/buy actions actually write to the database turned "backend later" into a real, working API that the rest of the team's features (email verification, AI pricing, fraud detection, due-date tracking) could be built on top of.
