# Week 4 : AI Price Was Invisible to Sellers

# PriceInsight Component

## Problem:

The price model's output only helps if the seller can see and
understand it while filling in the Sell/Lend form.

## Relevant Context

The API returns `recommendedPrice`, `fairMin`, `fairMax`,
confidence, explanation and `source` (ML model or formula).

## Key Observation

Compare the seller's asking price against the band, with a
small tolerance, and show a clear status.

## Solution

`src/components/PriceInsight.jsx`:

``` javascript
let status = 'Fairly priced'
if (ask > max * 1.1) { status = 'Priced above estimate'; statusColor = 'coral' }
else if (max > 0 && ask < min * 0.85) { status = 'Priced below estimate'; statusColor = 'sky' }
```

It also shows a "formula estimate" badge when the ML service
is down, and campus comparables when at least four similar
listings exist. The form asks for the model's inputs:
original price, condition, age and brand.

**Because**

A small tolerance avoids warning about tiny differences, and
the source badge is honest about where the estimate came from.
