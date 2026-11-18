# Campus Marketplace — Project Journal

**Student:** Raksha Pandey (1024031021)
**Group:** 3C73, BE Third Year, CSE
**Course:** UCS503 - Software Engineering
**Project:** Campus Marketplace (Buy / Borrow / Sell / Lend web app)
**Stack:** React (Vite) frontend · Express.js API · MongoDB (Mongoose) · Python/FastAPI ML services
**My focus:** AI models — price recommendation and fraud detection — plus the supporting trust features (email verification, Google Sign-In, duplicate-account detection, borrow/lend due-date tracking, trust score, privacy-first and encrypted location).

---

## 1. Project goal

Build a campus marketplace where verified students can browse listings, sell or lend items, chat, transact, manage a profile with trust scores, and (for admins) review a moderation queue. My part covered the features that make the marketplace trustworthy and "smart": verifying who can use it, guiding fair pricing, catching suspicious activity, tracking borrow/lend due dates, scoring user trust, and sharing location without exposing exact positions.

---

## 2. Problems I worked on and how they were overcome

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

### Problem 5 — No automated way to catch suspicious activity

**What happened:**
With no fraud screening, anomalous pricing or behaviour could only be caught by manual review.

**How it was overcome:**
- Built a companion scoring endpoint using an **Isolation Forest** that returns a fraud risk score with LOW / MEDIUM / HIGH level and named signals.
- Signals include duplicate titles or descriptions, listing bursts within an hour, extreme price deviation, new-account bursts, thin listing content and prior confirmed reports. A cheap price alone is not treated as fraud. HIGH-risk results feed the admin moderation queue.

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
- Built the **trust-score engine** (0–100, shown as stars) from verification, completed deals, average rating, on-time returns, account age, overdue loans, high-risk moderation cases and confirmed fraud reports, exposed at `GET /api/users/:id/trust-score`.

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
- Wrote 8 price-model sanity tests (later 17 ML tests in total, including 9 for the fraud model): the band contains the recommendation, price never exceeds the original, older is cheaper, better condition costs more, phones depreciate faster than textbooks, lending is a fraction of the sale price, a tiny MRP falls back to a typical price, and the model beats the naive baseline.


---

## 2b. Final phase — fraud detection model and completing the specification

### Problem 10 — The fraud "model" was only a placeholder

**What happened:**
The first Isolation Forest was fitted on 400 random points plus three hand-written anomalies, with 13 features. It had never been evaluated, it gave no reasons for its scores, and MEDIUM-risk listings were simply published, which did not match the decision rules in our specification.

**How it was overcome:**
- Wrote a **marketplace simulator** (`generate_fraud_data.py`) with 12,000 events: honest students (including two tricky honest groups, big genuine bargains and graduating students posting many items in an hour) and about 5% scams in six patterns: price bait, spam duplicates, multiple accounts, repeat offenders, stolen photos and messaging spikes. The labels are used only for evaluation, never for training the Isolation Forest.
- Designed **22 features** at listing, user and behavioural level: price below the AI fair price, price below comparable listings, duplicate title and description, no photos, photos reused from another seller, phone / UPI / "pay outside the app" text, urgency words, account age, verification, linked accounts on the same device, open and confirmed reports, trust score, listing bursts, messaging spikes and transaction spikes.
- Made every feature **risk-oriented and one-sided clipped**, so unusually good behaviour (old account, long description, high price) can never look anomalous.
- **Calibrated** the raw anomaly value to a 0–1 risk score with percentile anchors, and added **occlusion explanations** ("asking price far below the AI fair price, +0.15").
- Defined the **decision engine**: LOW (< 0.40) publish, MEDIUM (0.40–0.70) seller verifies with an emailed code, HIGH (≥ 0.70) hold for admin review.
- Prepared **stage 2**: admin decisions are exported as labels and a Random Forest classifier is blended in once there are at least 10 confirmed frauds and 10 approved listings.
- Result on 3,600 held-out events: ROC-AUC 0.997, 92% of scams flagged at MEDIUM or above with 85% precision, HIGH precision 100%, false alarms on honest students 0.9% (a simple "any red flag" rule bothers 7.2%).

---

### Problem 11 — A cheap calculator looked like fraud

**What happened:**
A ₹650 calculator from a trusted seller scored MEDIUM because "price versus category average" compared it with ₹40,000 phones that share the *electronics* category.

**How it was overcome:**
- Changed the feature to the **median of comparable listings** (same category, original price within ×0.5 to ×2), and neutral when fewer than four comparables exist.

---

### Problem 12 — Trusted accounts posting scam listings scored only MEDIUM

**What happened:**
All simulated price-bait scams came from brand-new accounts, so the model learned that "old account = safe". A ₹9,000 iPhone 14 Pro with "pay advance on WhatsApp" from an old account was not held.

**How it was overcome:**
- Made 30% of simulated price-bait come from **established (possibly compromised) accounts**. Such listings are now held (risk about 0.88).

---

### Problem 13 — New students' normal listings went to review

**What happened:**
During testing almost every listing from a freshly created account became MEDIUM. The simulator gave new accounts the same trust (about 64) as old ones, but our real trust formula starts a new verified student at about 50, so every real new account looked anomalous.

**How it was overcome:**
- Gave simulated new accounts the real starting trust range and made them more common, tightened the **alert budget** (about 5% of listings verified, 2.4% held), and added a guardrail: two or more independent red flags always reach at least MEDIUM. False alarms fell from about 2% to under 1% while recall stayed at about 92%.

---

### Problem 14 — The price model had to be justified against alternatives

**What happened:**
Our specification compares Linear Regression, Random Forest and Gradient Boosting, but only one model had been trained.

**How it was overcome:**
- Added a **model comparison** on the same split: Linear Regression MAPE 17.2%, Random Forest 9.0%, Gradient Boosting 8.7% (R² 0.986, MAE ₹334, RMSE ₹884). Random Forest and Gradient Boosting are equally accurate; Gradient Boosting is served because it supports monotone constraints and quantile loss, which gives the fair band directly (79% coverage of the 80% band).

---

### Problem 15 — Trust score, duplicate accounts and stored location did not fully meet the specification

**What happened:**
The trust score was an ad-hoc sum, several accounts could be created from one device, and exact user coordinates were stored in plain text.

**How it was overcome:**
- Rewrote the trust score to the specification's formula **T = 10 + 20V + 25R + 20C + 15O + 10A − 40F** (0–100), where confirmed reports weigh 1.0, admin-upheld flags 0.5 and open complaints only 0.15. Every change is written to an **audit log** with its reason, and the profile shows the breakdown.
- Added **duplicate-account detection**: the browser sends a random device id, the server stores only a peppered hash, refuses new sign-ups after three accounts on one device, and feeds the number of linked accounts to the fraud model.
- **Encrypted** stored coordinates with AES-256-GCM; the code still reads them as a normal location.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| Auth / email verification | Allowed college domains, hashed email OTP | **Me** |
| Google Sign-In | OAuth code flow, `email_verified` check | **Me** |
| FastAPI ML services | AI price recommendation, fraud risk scoring | **Me** |
| Training pipeline | Seed generator, retraining, real-data export | **Me** |
| Transaction model (lend/borrow) | Due-date field, status tracking, notifications | **Me** |
| Trust score | PDF formula, breakdown, audit trail of every change | **Me** |
| Location privacy | Opt-in, blurred coordinates, nearby search, AES-256-GCM encryption at rest | **Me** |
| Fraud model v3 | Simulator, 22 features, calibrated Isolation Forest, explanations, supervised stage | **Me** |
| Decision rules | LOW / MEDIUM / HIGH thresholds and the two-red-flag guardrail | **Me** |
| Duplicate-account detection | Hashed device id, linked-accounts feature, sign-up limit | **Me** |

---

## 4. Reflection

My part of the work sat on top of the core backend and frontend integration the rest of the team built. Once listings and transactions were persisting, I focused on making the platform trustworthy and useful rather than just functional: making sure only real students can use it, giving sellers a fair price to work from, giving admins an automated first line of defence against suspicious listings, giving borrowers and lenders a clear due date, and protecting privacy when location is shared. I was also careful to be honest about the models: they are trained on synthetic data, and the system is built to improve as real trades accumulate.

**Final phase:** the fraud model taught me that the hard part is not the algorithm but the trade-off between catching scams and bothering honest students. Every real problem we hit (the cheap calculator, trusted accounts, new students) came from the simulated data not matching how the real system behaves, and each fix made the simulation more faithful. I kept the evaluation honest by reporting a rule baseline next to the model and by stating clearly that all numbers come from simulated data.
