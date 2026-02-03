import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiLogin, apiLogout, apiMe, apiOtpVerify } from '../api/authApi.js'
import { clearAuthToken, getAuthToken, setAuthToken } from './tokenStorage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAuthToken())
  const [user, setUser] = useState(null)
  const [member, setMember] = useState(null)
  const [status, setStatus] = useState('loading')

  const applySession = useCallback((data) => {
    setAuthToken(data.token)
    setToken(data.token)
    setUser(data.user)
    setMember(data.member || null)
    setStatus('ready')
  }, [])

  const refresh = useCallback(async () => {
    const currentToken = getAuthToken()
    console.log('[DEBUG AuthContext] refresh() called, token:', currentToken ? 'EXISTS' : 'NONE')
    
    if (!currentToken) {
      setUser(null)
      setMember(null)
      setToken(null)
      setStatus('ready')
      return
    }

    try {
      console.log('[DEBUG AuthContext] Calling apiMe...')
      const data = await apiMe({ token: currentToken })
      console.log('[DEBUG AuthContext] apiMe response:', data)
      
      setToken(currentToken)
      setUser(data.user)
      setMember(data.member)
      
      console.log('[DEBUG AuthContext] State updated - User:', data.user, 'Member:', data.member)
    } catch (error) {
      console.error('[DEBUG AuthContext] apiMe error:', error)
      clearAuthToken()
      setToken(null)
      setUser(null)
      setMember(null)
    } finally {
      setStatus('ready')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signIn = useCallback(async ({ username, password }) => {
    const data = await apiLogin({ username, password })
    applySession(data)
    return data
  }, [applySession])

  const signInWithOtp = useCallback(
    async ({ challenge_id, otp }) => {
      const data = await apiOtpVerify({ challenge_id, otp })
      applySession(data)
      return data
    },
    [applySession],
  )

  const signOut = useCallback(async () => {
    const currentToken = getAuthToken()
    if (currentToken) {
      try {
        await apiLogout({ token: currentToken })
      } finally {
        clearAuthToken()
      }
    }

    setToken(null)
    setUser(null)
    setMember(null)
  }, [])

  const value = useMemo(
    () => ({ token, user, member, status, signIn, signInWithOtp, signOut, refresh }),
    [token, user, member, status, signIn, signInWithOtp, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
