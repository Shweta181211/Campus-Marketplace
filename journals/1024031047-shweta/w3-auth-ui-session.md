# Week 3 : Login and Session Handling in the UI

# Auth Context and Protected Routes

## Problem:

After OTP and Google Sign-In were added on the backend, pages
still loaded for users who were not signed in.

## Relevant Context

The token must be stored, sent on every request, and cleared
on logout or expiry.

## Key Observation

Keep the session in **one React context**, and guard routes
in **one wrapper**.

## Solution

The token is attached in a single place (`src/api.js`):

``` javascript
if (token) headers.Authorization = `Bearer ${token}`
```

Session refresh in the context (`src/auth.jsx`):

``` javascript
try {
  const me = await api.getCurrentUser()
  setUser(me)
} catch {
  setToken('')
  setUser(null)
}
```

Route guard (`src/App.jsx`):

``` javascript
function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div>Checking session…</div>
  if (!user) return <Navigate to="/auth" replace />
  if (!user.verified) return <Navigate to="/auth" replace />
  return children
}
```

**Because**

An invalid token is cleared automatically, and no page needs
its own login check.
