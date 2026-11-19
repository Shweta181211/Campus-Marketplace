# Week 3 : ML Service Could Break Listing Creation

# Price Recommendation with a Formula Fallback

## Problem:

Listing creation calls the FastAPI price service. If that
service was slow or offline, publishing failed.

## Relevant Context

The ML service runs separately on port 8000. The ML client
uses a short timeout.

## Key Observation

Compute a cheap formula estimate **first**, then replace it
with the ML answer only if the service responds.

## Solution

`server/utils/ai.js`:

``` javascript
export async function recommendPrice(payload) {
  const heuristic = heuristicPrice(payload)
  let out = heuristic
  try {
    const result = await predictPrice(payload)
    if (result?.recommendedPrice != null) out = sanitizePredictedPrice(result, heuristic)
  } catch {
    /* ML down — formula still returns a usable range, labelled source:'heuristic' */
  }
  return out
}
```

`/api/ai/price-predict` also adds campus comparables (median
and middle range) when at least four similar listings exist.

**Because**

The marketplace degrades gracefully: sellers always get a
price, and the label says honestly whether it came from the
model or the formula.
