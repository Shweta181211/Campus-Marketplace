# Campus Marketplace — Project Journal

**Student:** Shweta Agarwal (1024031047)
**Group:** 3C73, BE Third Year, CSE
**Course:** UCS503 - Software Engineering
**Project:** Campus Marketplace (Buy / Borrow / Sell / Lend web app)
**Stack:** React (Vite) frontend · Express.js API · MongoDB (Mongoose) · Python/FastAPI ML services
**My focus:** Frontend, frontend-backend integration, demo data, UI for the AI / fraud / payment / location features, the admin console, and documentation (README, report).

---

## 1. Project goal

Build a campus marketplace where verified students can browse listings, sell or lend items, chat, transact, manage a profile with trust scores, and (for admins) review a moderation queue. The UI existed first as a frontend-only prototype; the project then became a full-stack system. My part covered connecting the React frontend to the backend cleanly, making every screen work with real data, surfacing the AI, payment and location features in the interface, and making sure the app looked and worked properly for demos, not just in theory.

---

## 2. Problems I worked on and how they were overcome

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
- Wrote `server/seed.js` with relevant sample data, first 15 listings and later about 30 verified students and about 70 sale and lend listings, plus loans, reviews, watchlists, notifications, payments and high-risk fraud examples (all marked `isSeed: true`).
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

### Problem 6 — AI results and fraud decisions were invisible to users

**What happened:**
The price and fraud models only mattered if sellers, buyers and admins could see and understand their output.

**How it was overcome:**
- Built the **PriceInsight** component: recommended price, fair band, confidence, explanation, a "formula estimate" label when the ML service is down, and live campus comparables when enough similar listings exist.
- Extended the Sell/Lend form with the inputs the model needs (original price, condition, age, brand) and the fraud-warning messages shown after publishing.
- Built the **TrustBadge** component and the **Admin Moderation** page for reviewing held listings.

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

## 2b. Final phase — admin console, fraud and trust UI, avatar builder, documentation

### Problem 9 — The fraud decision was invisible to sellers

**What happened:**
After the decision engine was added, a MEDIUM-risk listing waited for a code and a HIGH-risk listing was held, but the seller only saw a generic "listing submitted" message and had no way to finish the verification.

**How it was overcome:**
- Built the **VerifyListing** panel: the seller enters the 6-digit code (shown on screen in development mode) and can resend it, both on the success screen and in My Listings.
- My Listings now shows clear status badges ("needs verification", "under admin review") and the reasons a listing was held.
- The success screen shows the AI fraud screening level and the AI fair range.

---

### Problem 10 — The admin page could only approve or reject listings

**What happened:**
The moderation page listed held listings and nothing else, while admins now needed reports, suspension, analytics and settings.

**How it was overcome:**
- Rebuilt it as an **Admin console** with seven tabs: **Fraud alerts** (risk meter with the 0.40 / 0.70 thresholds, reasons, signals, note to seller), **Reports** (confirm, confirm and remove, dismiss), **Users** (search, linked accounts, suspend / unsuspend), **Analytics** (stat tiles, bars by status, category and risk level, overdue loans), **Settings** (banned words, enable / disable / add categories), **AI models** (ROC-AUC, recall, false alarms, detection by scam pattern) and **Audit log**.

---

### Problem 11 — Students had no way to report, set alerts or understand their trust score

**What happened:**
The new backend features (reports, price-drop thresholds, trust breakdown) had no controls in the interface.

**How it was overcome:**
- Added **Report listing** on the listing page and a **report icon on received chat messages**.
- Added a **price-drop alert** control on the listing page (any drop, at least %, at least ₹).
- Added a **trust-score breakdown** on the profile showing each part of the formula and the score history from the audit trail.
- Made category lists load from the server so admin changes appear for sellers.
- The API client now sends a random per-browser device id used for duplicate-account detection.

---

### Problem 12 — Profiles used only an emoji avatar

**What happened:**
Our specification asks for a component-based avatar (face, hair, clothing, accessories and colours) so students do not need a real photo.

**How it was overcome:**
- Built an **AvatarBuilder** with live preview and a random option, and an SVG **AvatarFigure** used in the profile, navbar, listing pages and admin user list. Also added profile editing of name and hostel.

---

### Problem 13 — Testing fraud detection in a demo was confusing

**What happened:**
While testing, a very high asking price showed "Priced above estimate" and it was unclear whether fraud detection was working. Repeatedly posting the same test item also triggered the spam rule.

**How it was overcome:**
- Documented that the price insight comes from the price model, that fraud screening runs only on publish, and that a high price is not treated as fraud (scams use too-good-to-be-true prices).
- Added a step-by-step demo in the README: a normal listing (LOW), a "pay advance on WhatsApp" listing (MEDIUM), a ₹9,000 iPhone 14 Pro (HIGH), and how to check the result in the admin console.

---

### Problem 14 — The report and documentation no longer matched the final system

**What happened:**
The report still described the first Random Forest price model (R² 0.623) and the placeholder fraud model.

**How it was overcome:**
- Updated the README (fraud model, decision engine, reports, admin console, trust formula, feature-coverage table, 13-step manual checklist) and the final LaTeX report: new requirements (FR14–FR16), the 22 fraud features, the decision-engine table, the trust formula, the new API modules, the model comparison and fraud metrics, and the new challenges, while keeping the same format and diagrams.
- Seed data now has realistic account and listing dates, avatars, alert thresholds and example reports.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| React (Vite) frontend wiring | Icon hydration, API client, pages and components | **Me** |
| Dev environment (CORS + Vite proxy) | Frontend and backend connectivity | **Me** |
| Seed data (`server/seed.js`) | Demo-ready users, listings, loans, reviews, notifications | **Me** |
| Auth and marketplace UI | Auth page, Messages, Notifications, Transactions, Dashboard | **Me** |
| AI / trust UI | PriceInsight, TrustBadge, Admin Moderation page | **Me** |
| Uploads, checkout, location UI | ImageUploader, payment flow, nearby filter | **Me** |
| Admin console UI | Fraud alerts, reports, users, analytics, settings, AI models, audit log | **Me** |
| Fraud and trust UI | Verification panel, report buttons, price-drop alert control, trust breakdown | **Me** |
| Avatar builder | Component-based SVG avatar and profile editing | **Me** |
| Documentation | README, manual test checklist, final project report | **Me** |

---

## 4. Reflection

My part of the work was less about database internals and more about making sure the frontend and backend actually talked to each other cleanly, and that the app looked "alive" the moment someone opened it, rather than a blank, broken-looking screen. Fixing the icon-storage mismatch, sorting out CORS and proxy config, writing realistic seed data and then building the interfaces for pricing, fraud review, payments, uploads and location meant the rest of the team's backend and ML work was actually visible, usable and demoable.

**Final phase:** a model or an admin rule only helps if people can see and act on it. Most of my final work was turning backend decisions into clear screens: why a listing is held, how to finish verification, how the trust score is built, and one console where an admin can handle everything. Writing the demo steps also showed me that good documentation is part of the feature: without it, a correctly working fraud model looked broken during testing.
