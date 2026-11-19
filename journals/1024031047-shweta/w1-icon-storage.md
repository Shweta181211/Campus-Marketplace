# Week 1 : Icons Could Not Be Stored in MongoDB

# Storing a Key Instead of a Component

## Error:

Listings saved from the UI lost their icons after reload.

> Lucide icon components (BookOpen, Bike, ...) are functions,
> and functions are not serialisable to MongoDB.

## Relevant Context

Mock listings held the icon **component** itself in an `icon`
field, which works only in memory.

## Key Observation

Store **data** (a string key) in the database, and turn it back
into a component only when rendering.

## Solution

The schema stores `iconKey` (for example `"books"`), and the
client maps it back (`src/data/mockData.js`):

``` javascript
export function hydrateListing(listing) {
  if (!listing) return listing
  const iconKey = listing.iconKey || listing.category || 'other'
  return {
    ...listing,
    id: listing.id || listing._id,
    icon: iconMap[iconKey] || Package,
  }
}
```

**Because**

The database should hold plain JSON. UI concerns such as
icons belong in the client, with `Package` as a safe default.
