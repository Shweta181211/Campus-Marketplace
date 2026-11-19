# Week 4 : Borrow/Lend Had No Return Deadline

# Deriving Loan Status from Dates

## Problem:

Sales and loans were treated the same. Nothing told a
borrower when an item was due.

## Relevant Context

A loan needs states such as ACTIVE, DUE_SOON and OVERDUE, and
both sides should be notified.

## Key Observation

The status is a pure function of `dueDate` and the current
time, so it can be **recomputed** instead of set by hand.

## Solution

`server/utils/loans.js`:

``` javascript
const due = new Date(dueDate).getTime()
const now = Date.now()
const soon = 2 * 24 * 60 * 60 * 1000
if (now > due) return { status: 'OVERDUE', overdueStatus: true }
if (due - now <= soon) return { status: 'DUE_SOON', overdueStatus: false }
return { status: 'ACTIVE', overdueStatus: false }
```

A background job runs `refreshLoanStatuses()` every five
minutes and sends due-soon / overdue notifications without
duplicates.

**Because**

One function decides the status everywhere (API, job and
labels such as "Due in 2 days"), so the states cannot drift
apart.
