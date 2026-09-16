# Campus Marketplace — Project Journal

**Student:** Raksha Pandey (1024031021)
**Group:** 3C73, BE Third Year, CSE
**Course:** UCS503 - Software Engineering
**Project:** Campus Marketplace (Buy / Borrow / Sell / Lend web app)
**Stack:** React (Vite) frontend · Express.js API · MongoDB (Mongoose) · Python/FastAPI ML services
**My focus this phase:** AI models — price recommendation and fraud detection — plus the supporting trust features (email verification, borrow/lend due-date tracking).

---

## 1. Project goal

Build a campus marketplace where students can browse listings, sell or lend items, view messages and transactions, manage a profile with trust scores, and (for admins) review a moderation queue. The UI existed first as a frontend-only prototype; this phase made the **backend and MongoDB fully functional**. My part of this phase covered the features that make the marketplace trustworthy and "smart": verifying who can use it, guiding fair pricing, catching suspicious activity, and tracking borrow/lend due dates.

---

## 2. Problems I worked on and how they were overcome

### Problem 1 — Sign-up had no way to confirm a user was actually a student

**What happened:**
Anyone with any email could create an account, which defeats the point of a campus-exclusive marketplace — there was no barrier to non-students listing, messaging, or transacting.

**How it was overcome:**
- Added institutional email verification during sign-up, so only users with a valid campus email address can create listings, message, or transact on the platform.

---

### Problem 2 — No way to price listings fairly

**What happened:**
Sellers had no guidance on what to charge for a used item, so prices across similar listings were inconsistent and buyers had no easy way to judge whether an asking price was fair.

**How it was overcome:**
- Built a FastAPI microservice hosting a regression model (Random Forest, with an XGBoost variant) trained to suggest a fair price band for a listing based on category, condition, and comparable items.

---

### Problem 3 — No automated way to catch suspicious activity

**What happened:**
With no fraud screening, there was no way to flag anomalous pricing or behaviour for admin review, so the moderation queue depended entirely on manual review.

**How it was overcome:**
- Built a companion FastAPI microservice running an Isolation Forest model that assigns a fraud risk score to listings and transactions, surfacing flagged items to admins through the moderation queue.

---

### Problem 4 — Borrow/lend transactions had no return deadline

**What happened:**
Sale and lend/borrow transactions were treated identically, so there was nothing to tell a borrower when an item needed to be returned, or to let a lender track it.

**How it was overcome:**
- Lend/borrow transactions now carry a due date, tracked so both parties can see when the item is expected back.

---

## 3. My part of the architecture

| Layer | Responsibility | Owner |
|--------|----------------|-------|
| Auth / email verification | Restricting sign-up to verified institutional emails | **Me** |
| FastAPI ML services | AI price recommendation, fraud risk scoring | **Me** |
| Transaction model (lend/borrow) | Due-date field and tracking | **Me** |

---

## 4. Reflection

My part of the work sat on top of the core backend and frontend integration the rest of the team built — once listings and transactions were actually persisting, I focused on making the platform trustworthy and useful rather than just functional: making sure only real students can use it, giving sellers a fair price to work from, giving admins an automated first line of defence against suspicious listings, and giving borrowers and lenders a clear due date to work with. These are the features that turn a basic CRUD marketplace into something closer to production-ready.
