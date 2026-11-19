# Week 5 : Photos, Checkout and Nearby Search Had No UI

# ImageUploader, Payment Flow and Nearby Filter

## Problem:

Cloud upload, payments and opt-in location existed on the
backend but had no controls in the interface.

## Relevant Context

Photos are limited to 5 MB each and six per listing.
Nearby search is off by default.

## Key Observation

Upload photos **as soon as they are picked**, so the listing
form sends only URLs.

## Solution

`src/components/ImageUploader.jsx`:

``` javascript
const oversize = files.find((f) => f.size > MAX_MB * 1024 * 1024)
if (oversize) throw new Error(`${oversize.name} is over ${MAX_MB} MB even after resizing`)
const res = await api.uploadImages(files)
setImages((imgs) => [...imgs, ...res.images.map((i) => ({ id: i.id, url: i.url }))].slice(0, 6))
```

Nearby filter with a radius slider (`src/pages/BuyBorrow.jsx`):

``` javascript
...(wantNearby ? { nearby: 'true', radiusKm: filters.radiusKm } : {}),
```

Checkout uses Razorpay, or a clearly labelled development mode
("Simulate signed success") when no keys are set.

**Because**

Early upload gives instant feedback, and labelling dev mode
prevents anyone mistaking it for a real charge.
