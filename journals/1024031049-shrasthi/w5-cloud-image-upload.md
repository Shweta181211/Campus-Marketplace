# Week 5 : Photos Stored as Base64 Bloated the Database

# Cloudinary Uploads with Magic-Byte Checks

## Problem:

Images embedded as base64 made listings huge and every query
slow.

## Relevant Context

Limits: 5 MB per photo and six photos per listing, resized to
at most 1600 px.

## Key Observation

Store only a **URL** in the listing, and identify the real
file type from its bytes, never from its name.

## Solution

`server/utils/storage.js`:

``` javascript
/** Identify the real image type from magic bytes (never trust the client's MIME type or filename). */
if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return { mime: 'image/gif', ext: 'gif' }
```

- A listing can use only photos uploaded by the same seller.
- Removing a listing deletes its files, and orphan uploads are
  cleaned up after 24 hours.
- A local-disk fallback is used in development.
- `npm run migrate-images` moves old base64 photos to the cloud.

**Because**

A renamed `.exe` cannot pass as `photo.jpg`, and URL-only
listings keep documents small and fast.
