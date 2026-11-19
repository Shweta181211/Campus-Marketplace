# Week 2 : CORS Errors Between Vite and Express

# Proxying /api Through Vite

## Error:

> Access to fetch at 'http://localhost:5001/api/listings' from
> origin 'http://localhost:5173' has been blocked by CORS policy

## Relevant Context

The Vite dev server runs on port 5173 and the API on 5001.
Different ports mean different origins.

## Key Observation

If the browser only ever calls its own origin (`/api/...`),
no cross-origin request happens in development.

## Solution

`vite.config.js`:

``` javascript
server: {
  proxy: {
    '/api': { target: 'http://localhost:5001', changeOrigin: true },
    '/uploads': { target: 'http://localhost:5001', changeOrigin: true },
  },
},
```

CORS is still enabled on the API for other origins
(`server/index.js`):

``` javascript
app.use(cors({ origin: origins.map((s) => s.trim()), credentials: true }))
```

All requests go through one client, `src/api.js`.

**Because**

The proxy removes the problem in development, and the
explicit CORS list keeps production safe.
