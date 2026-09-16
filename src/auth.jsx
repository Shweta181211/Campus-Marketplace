import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await api.getCurrentUser()
      setUser(me)
    } catch {
      setToken('')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser,
      refresh,
      loginWithToken: async (token, nextUser) => {
        setToken(token)
        setUser(nextUser || null)
        if (!nextUser) await refresh()
      },
      logout: async () => {
        try {
          await api.logout()
        } catch {
          /* token may already be invalid */
        }
        setToken('')
        setUser(null)
      },
    }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
