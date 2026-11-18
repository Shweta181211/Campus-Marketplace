# Campus Marketplace — Project Journal



---


### Problem 1 — Frontend icons could not be stored in MongoDB

**What happened:**
Listings in the UI used Lucide React icon **components** (`BookOpen`, `Bike`, etc.). Those cannot be saved in MongoDB as functions.

**How it was overcome:**
- Stored a string field `iconKey` (e.g. `"books"`, `"electronics"`) in the Listing schema.
- Added `hydrateListing()` on the frontend to map `iconKey` to a Lucide component before rendering cards and details.

---

### Problem 2 — CORS / API URL mismatch between Vite and Express

**What happened:**
The Vite app runs on one port (e.g. 5173) and the API on another (5001). Browser requests would fail with CORS or wrong-origin errors if pointed incorrectly.

**How it was overcome:**
- Enabled `cors()` on Express and added a Vite **proxy**, so the frontend calls `/api/...` and Vite forwards to `http://localhost:5001`.
- Centralised all fetch calls in `src/api.js` and connected Buy/Borrow, Sell/Lend, My Listings, Messages, Transactions, Profile and Admin pages to it.

---

### Problem 3 — Empty database vs. demo-ready UI

**What happened:**
A brand-new database has no listings, so Buy/Borrow and Dashboard looked broken even when the API worked. Real usage data only appears after people use the app.

**How it was overcome:**
- Wrote `server/seed.js` with relevant sample data, first 15 listings and later about 30 verified students and about 70 sale and lend listings, plus loans, reviews, watchlists and notifications (all marked `isSeed: true`).
- The server seeds automatically when the database is empty; manual re-seed with `npm run seed`. Demo logins for a student and an admin are documented.

---

### Problem 4 — Sign-up, login and session handling in the UI

**What happened:**
With verification and Google Sign-In added on the backend, the UI needed a clear register, OTP and login flow and a way to keep the session and protect pages.

**How it was overcome:**
- Built the Auth page (register, 6-digit OTP, login, Continue with Google) and the Google callback page.
- Added an auth context that stores the token and signed-in user and handles logout, so protected pages only load for verified users.

---

### Problem 5 — Many screens were still static or incomplete

**What happened:**
Messages, notifications, transactions, watchlist and the dashboard needed to reflect live data and the new borrow/lend states (due soon, overdue, extension, return).

**How it was overcome:**
- Built the Messages, Notifications and Transactions ("Loans & payments") pages, favourites (watchlist) support, My Listings actions and the Dashboard on top of the API.
- Showed due-date labels ("Due in 2 days", "1 day overdue") and loan status on the Transactions page.

---

### Problem 6 — AI price recommendations were not visible to users

**What happened:**
The price-recommendation model only helped sellers if its output was clearly presented in the interface.

**How it was overcome:**
- Built the **PriceInsight** component: recommended price, fair band, confidence, explanation, a "formula estimate" label when the ML service is down, and live campus comparables when enough similar listings exist.
- Extended the Sell/Lend form with the inputs the price model needs (original price, condition, age and brand).
- Built the **TrustBadge** component to display marketplace reliability information.

---

### Problem 7 — Photos, checkout and nearby search needed real UI

**What happened:**
Cloud image upload, payments and optional location sharing existed on the backend but had no user-facing controls.

**How it was overcome:**
- Built the **ImageUploader** (photos upload as soon as they are picked, with status and limits).
- Built the checkout flow with Razorpay and a clearly labelled development mode ("Simulate signed success").
- Added the Profile opt-in for nearby discovery (browser permission), the per-listing "Show in nearby searches" option, and the Buy/Borrow "Nearby only" filter with a radius slider showing results like `~1.2 km away`.

---

### Problem 8 — The project was hard to run, test and explain

**What happened:**
With many moving parts (frontend, API, ML service, payments, storage) a new person could not tell how to start or verify it.

**How it was overcome:**
- Wrote the full **README**: architecture, folder structure, environment variables, database and seed setup, how to run each service, payment and storage guides, API overview, known limitations.
- Added a step-by-step manual test checklist and kept `npm run lint` and `npm run build` passing.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| React (Vite) frontend wiring | Icon hydration, API client, pages and components | **Me** |
| Dev environment (CORS + Vite proxy) | Frontend and backend connectivity | **Me** |
| Seed data (`server/seed.js`) | Demo-ready users, listings, loans, reviews, notifications | **Me** |
| Auth and marketplace UI | Auth page, Messages, Notifications, Transactions, Dashboard | **Me** |
| AI / trust UI | PriceInsight and TrustBadge components | **Me** |
| Uploads, checkout, location UI | ImageUploader, payment flow, nearby filter | **Me** |
| Documentation | README, manual test checklist | **Me** |

---

## 4. Reflection

My part of the work was less about database internals and more about making sure the frontend and backend actually talked to each other cleanly, and that the app looked "alive" the moment someone opened it, rather than a blank, broken-looking screen. Fixing the icon-storage mismatch, sorting out CORS and proxy config, writing realistic seed data and then building the interfaces for pricing, payments, uploads and location meant the rest of the team's backend and ML work was actually visible, usable and demoable.
