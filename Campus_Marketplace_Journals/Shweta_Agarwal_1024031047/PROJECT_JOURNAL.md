# Campus Marketplace — Project Journal

**Student:** Shweta Agarwal (1024031047)
**Group:** 3C73, BE Third Year, CSE
**Course:** UCS503 - Software Engineering
**Project:** Campus Marketplace (Buy / Borrow / Sell / Lend web app)
**Stack:** React (Vite) frontend · Express.js API · MongoDB (Mongoose)
**My focus this phase:** Frontend-backend integration and making the app demo-ready.

---

## 1. Project goal

Build a campus marketplace where students can browse listings, sell or lend items, view messages and transactions, manage a profile with trust scores, and (for admins) review a moderation queue. The UI existed first as a frontend-only prototype; this phase made the **backend and MongoDB fully functional**. My part of this phase covered connecting the existing React frontend to the new backend cleanly and making sure the app looked and worked properly for demos, not just in theory.

---

## 2. Problems I worked on and how they were overcome

### Problem 1 — Frontend icons could not be stored in MongoDB

**What happened:**
Listings in the UI used Lucide React icon **components** (`BookOpen`, `Bike`, etc.). Those cannot be saved in MongoDB as functions.

**How it was overcome:**
- Stored a string field `iconKey` (e.g. `"books"`, `"electronics"`) in the Listing schema.
- Added `hydrateListing()` on the frontend to map `iconKey` → Lucide component before rendering cards and details.

---

### Problem 2 — CORS / API URL mismatch between Vite and Express

**What happened:**
The Vite app runs on one port (e.g. 5173) and the API on another (5001). Browser requests would fail with CORS or wrong-origin errors if pointed incorrectly.

**How it was overcome:**
- Enabled `cors()` on Express.
- Added a Vite **proxy** so frontend calls `/api/...` and Vite forwards to `http://localhost:5001`.
- Centralized all fetch calls in `src/api.js`.

---

### Problem 3 — Empty database vs. demo-ready UI

**What happened:**
A brand-new database has no listings, so Buy/Borrow and Dashboard looked broken even when the API worked. Real usage data can only appear after people actually use the app.

**How it was overcome:**
- Wrote `server/seed.js` with **relevant sample data**: 15 listings (books, cycles, hostel items, notes, electronics), users (including Riya Sharma), 3 message threads, 3 transactions, 3 reviews, and 3 moderation cases.
- Server seeds automatically when the listings collection is empty.
- Manual re-seed: `npm run seed`.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| React (Vite) frontend wiring | Icon hydration, API proxy config | **Me** |
| Dev environment (CORS + Vite proxy) | Frontend ↔ backend connectivity | **Me** |
| Seed data (`server/seed.js`) | Demo-ready sample listings, users, messages, transactions, reviews, moderation | **Me** |

---

## 4. Reflection

My part of the work was less about the database internals and more about making sure the frontend and backend actually talked to each other cleanly, and that the app looked "alive" the moment someone opened it — rather than a blank, broken-looking screen. Fixing the icon-storage mismatch, sorting out CORS/proxy config between Vite and Express, and writing realistic seed data meant the rest of the team's backend and ML work was actually visible and demoable in the UI.
