Problems I worked on and how they were overcome

### Problem 1 — Sign-up had no way to confirm a user was actually a student

**What happened:**
Anyone with any email could create an account, which defeats the point of a campus-exclusive marketplace. There was no barrier to non-students listing, messaging or transacting.

**How it was overcome:**
- Added institutional email verification: only addresses on an allowed college-domain list (configurable, e.g. `campus.edu`, `thapar.edu`) can register.
- Implemented **email OTP**: hashed with a server-side pepper, with expiry, a maximum number of attempts and a resend cooldown. OTPs are sent over SMTP, with a development mode that returns the OTP for local testing.

---

### Problem 2 — Not every student signs in with a password

**What happened:**
Password sign-up with a Gmail address cannot prove the person is a student, and many students prefer signing in with Google.

**How it was overcome:**
- Added **Google Sign-In** using the OAuth code flow (`/api/auth/google/start` and callback). The backend exchanges the code, checks `email_verified`, and creates a verified session for allowed accounts.
- Gmail password sign-ups are redirected to Google Sign-In; without Google credentials the app shows a setup page instead of failing silently.

---

### Problem 3 — No way to price listings fairly

**What happened:**
Sellers had no guidance on what to charge for a used item, so prices were inconsistent and buyers could not judge whether an asking price was fair.

**How it was overcome:**
- Built a **FastAPI microservice** hosting the price model. I started with Random Forest and an XGBoost comparison, then moved to **HistGradientBoosting quantile regressors (10th / 50th / 90th percentile)** trained on `log(price / original price)`.
- Features: original price, age, condition, demand, category, item class from the title (phone, laptop, textbook…), brand tier, sale vs lend and lend unit.
- Added **monotone constraints** (older never costs more, better condition never costs less) and **conformalised** bands for about 80% coverage.
- Result on the held-out test set: **MAPE about 8.7%** versus about 44% for a naive condition-average baseline.

---

### Problem 4 — No real sales data to train on

**What happened:**
A brand-new campus marketplace has no completed trades, so there was nothing real to learn from, and presenting model accuracy as real market accuracy would be misleading.

**How it was overcome:**
- Wrote a seed-data generator with realistic depreciation curves and noise, and trained on that, clearly labelled as synthetic in the metrics file and README.
- Built an **export script** for real paid sales and a retraining path that weights real rows 5x, plus automatic retraining at start-up if the model file is missing or from an incompatible scikit-learn.

---

### Problem 6 — Borrow/lend transactions had no return deadline

**What happened:**
Sale and lend/borrow transactions were treated identically, so nothing told a borrower when an item was due or let a lender track it.

**How it was overcome:**
- Lend/borrow transactions now carry a **due date** with automatic status: ACTIVE, DUE_SOON (within two days) and OVERDUE.
- A background job refreshes statuses every five minutes and sends due-soon and overdue notifications to both borrower and lender without duplicating them.

---

### Problem 7 — Users had no way to judge each other

**What happened:**
A verified email alone says little about whether someone returns items on time or sells honestly.

**How it was overcome:**
- Built the **trust-score engine** (0–100, shown as stars) from verification, completed deals, average rating, on-time returns, account age and overdue loans, exposed at `GET /api/users/:id/trust-score`.

---

### Problem 8 — Location sharing risked exposing students

**What happened:**
Nearby discovery is useful, but storing or returning exact coordinates would be a serious privacy risk on a campus.

**How it was overcome:**
- Built **opt-in location** with two independent switches (buyer and seller), both off by default.
- Seller points are **blurred by 80–220 m** before storage and exact coordinates are never returned by any API; buyers only see values like `~1.2 km away`.
- Buyer location expires after seven days and is deleted when turned off. Nearby search uses geohash helpers, a bounding box plus haversine distance, and combines with category, price and condition filters.

---

### Problem 9 — Models needed to be checked, not just trusted

**What happened:**
A model that trains without errors can still give nonsense prices.

**How it was overcome:**
- Wrote 8 ML sanity tests: the band contains the recommendation, price never exceeds the original, older is cheaper, better condition costs more, phones depreciate faster than textbooks, lending is a fraction of the sale price, a tiny MRP falls back to a typical price, and the model beats the naive baseline.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| Auth / email verification | Allowed college domains, hashed email OTP | **Me** |
| Google Sign-In | OAuth code flow, `email_verified` check | **Me** |
| FastAPI ML service | AI-based price recommendation | **Me** |
| Training pipeline | Seed generator, retraining, real-data export | **Me** |
| Transaction model (lend/borrow) | Due-date field, status tracking, notifications | **Me** |
| Trust score | Score engine and endpoint | **Me** |
| Location privacy | Opt-in, blurred coordinates, nearby search | **Me** |

---

## 4. Reflection

My part of the work sat on top of the core backend and frontend integration the rest of the team built. Once listings and transactions were persisting, I focused on making the platform trustworthy and useful rather than just functional: making sure only real students can use it, giving sellers a fair price to work from, giving borrowers and lenders a clear due date, and protecting privacy when location is shared. I was also careful to be honest about the models: they are trained on synthetic data, and the system is built to improve as real trades accumulate.
