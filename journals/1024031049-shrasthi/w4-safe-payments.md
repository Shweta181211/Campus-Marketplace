# Week 4 : Payments Could Be Tampered With or Double-Booked

# Server Price, Atomic Reservation and Signature Check

## Problem:

- The browser could send a fake price.
- Two students could pay for the same item.
- A buyer could close the tab right after paying.

## Relevant Context

Razorpay, or a signed development gateway when no keys are
set. Prices are in rupees.

## Key Observation

The **server** must own the amount, the reservation and the
final state.

## Solution

Amount from the database, then an atomic 15-minute reservation
(`server/routes/payments.js`):

``` javascript
const rupees = Number(listing.price)

const reserved = await Listing.findOneAndUpdate(
  { _id: listing._id, $or: [{ status: 'active' }, { status: 'reserved', reservedBy: req.user._id }] },
  { $set: { status: 'reserved', reservedBy: req.user._id, reservedUntil: new Date(Date.now() + RESERVATION_MS) } },
  { new: true }
)
if (!reserved) return res.status(409).json({ error: 'Listing was just taken by another student' })
```

Constant-time signature check (`server/utils/payments.js`):

``` javascript
const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
const a = Buffer.from(expected)
const b = Buffer.from(String(signature || ''))
if (a.length !== b.length) return false
return crypto.timingSafeEqual(a, b)
```

A signed webhook finalises the payment even if the tab is
closed. Finalisation is an atomic claim, so it happens only
once. Late payments for an already-sold item are refunded
automatically.

**Because**

`findOneAndUpdate` with a status filter is a single atomic
step, so only one buyer can win the race.
