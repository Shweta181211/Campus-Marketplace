# Campus Marketplace — Project Journal

**Student:** Shweta Agarwal  
**Project:** Campus Marketplace (Buy / Borrow / Sell / Lend web app)  
**Stack:** React (Vite) frontend · Express.js API · MongoDB (Mongoose)

---

## 1. Project goal

Build a campus marketplace where students can browse listings, sell or lend items, view messages and transactions, manage a profile with trust scores, and (for admins) review a moderation queue. The UI existed first as a frontend-only prototype; this phase made the **backend and MongoDB fully functional**.

---

## 2. Problems faced (so far) and how they were overcome

### Problem 1 — Backend was not working at all

**What happened:**  
Until this phase, the app ran only as a React frontend. All data lived in `src/data/mockData.js`. There was no API server, no database, and no way to persist new listings, messages, or transactions. For submission and demos, “backend not working” meant the project looked incomplete and could not store real usage data.

**How it was overcome:**  
- Created a dedicated `server/` package with **Express + Mongoose**.  
- Defined models: `User`, `Listing`, `Message`, `Transaction`, `Review`, `Moderation`.  
- Exposed REST routes under `/api/...` (listings, users, messages, transactions, reviews, moderation, health).  
- Connected every major page to the API via `src/api.js` so Buy/Borrow, Sell/Lend, My Listings, Messages, Transactions, Profile, and Admin all read/write MongoDB instead of hardcoded arrays.

---

### Problem 2 — MongoDB was not installed on the development machine

**What happened:**  
`mongod` / `mongosh` were not available locally, and Docker was also missing. Connecting only to `mongodb://127.0.0.1:27017` would make the API crash on startup. This was one of the main reasons the backend appeared “not working” during earlier attempts.

**How it was overcome:**  
- Added automatic fallback with **`mongodb-memory-server`**: if local MongoDB is unreachable, the server starts an in-memory MongoDB instance so the backend still runs for development and demos.  
- Kept a real URI in `server/.env` (`MONGODB_URI`) so installing MongoDB Community / Atlas later is a one-line change (`USE_MEMORY_DB=false` or simply having mongod running).  
- On first start, if collections are empty, the server **auto-seeds** sample campus data.  
- Verified live: API on port `5001` connected in `memory` mode, seeded 15 listings + users/messages/transactions/reviews/moderation, and the React UI loaded that data from MongoDB.

---

### Problem 3 — Frontend icons could not be stored in MongoDB

**What happened:**  
Listings in the UI used Lucide React icon **components** (`BookOpen`, `Bike`, etc.). Those cannot be saved in MongoDB as functions.

**How it was overcome:**  
- Stored a string field `iconKey` (e.g. `"books"`, `"electronics"`) in the Listing schema.  
- Added `hydrateListing()` on the frontend to map `iconKey` → Lucide component before rendering cards and details.

---

### Problem 4 — CORS / API URL mismatch between Vite and Express

**What happened:**  
The Vite app runs on one port (e.g. 5173) and the API on another (5001). Browser requests would fail with CORS or wrong-origin errors if pointed incorrectly.

**How it was overcome:**  
- Enabled `cors()` on Express.  
- Added a Vite **proxy** so frontend calls `/api/...` and Vite forwards to `http://localhost:5001`.  
- Centralized all fetch calls in `src/api.js`.

---

### Problem 5 — Empty database vs. demo-ready UI

**What happened:**  
A brand-new database has no listings, so Buy/Borrow and Dashboard looked broken even when the API worked. Real usage data can only appear after people actually use the app.

**How it was overcome:**  
- Wrote `server/seed.js` with **relevant sample data**: 15 listings (books, cycles, hostel items, notes, electronics), users (including Riya Sharma), 3 message threads, 3 transactions, 3 reviews, and 3 moderation cases.  
- Server seeds automatically when the listings collection is empty.  
- Manual re-seed: `npm run seed`.

---

### Problem 6 — Publishing a listing only updated React state

**What happened:**  
Sell/Lend previously called `onPublish` and kept the new item only in memory. Refreshing the page wiped it.

**How it was overcome:**  
- `POST /api/listings` creates a document in MongoDB (with seller = current user Riya, fair-price band, category metadata).  
- My Listings loads via `GET /api/listings/mine`.  
- Buy/Borrow and Dashboard refetch from `GET /api/listings`.

---

### Problem 7 — Chat / buy actions were toast-only stubs

**What happened:**  
“Chat with seller” and “Buy / Borrow” only showed a toast; nothing was stored.

**How it was overcome:**  
- Chat creates a `Message` document.  
- Buy / Borrow creates a `Transaction` document.  
- Messages and Transactions pages load from MongoDB so the history grows with use.

---

## 3. Current architecture (after fixes)

| Layer | Responsibility |
|--------|----------------|
| React (Vite) | UI, routing, filters, favorites |
| Express API (`server/`) | REST endpoints, validation, business rules |
| MongoDB + Mongoose | Persistent storage for users, listings, chats, txns, reviews, moderation |

**Run locally:**
1. `npm install` (root)  
2. `npm install --prefix server`  
3. Terminal A: `npm run server`  
4. Terminal B: `npm run dev`  
5. Open the Vite URL; API health: `http://localhost:5001/api/health`

---

## 4. What still depends on real usage

Seed data is enough to demonstrate browsing, filtering, profile, messages, transactions, and moderation. Additional listings, chats, and purchases will appear **only after real campus use** (or further seeding). That is expected — the backend is ready to store them.

---

## 5. Reflection

The hardest gap was not the UI — it was making a **working backend** when MongoDB was unavailable and the frontend was still hardwired to mock data. Splitting API + models + seed + frontend hydration, and adding an in-memory MongoDB fallback, turned a broken “backend later” prototype into a fully functional demo stack suitable for journal submission and viva.
