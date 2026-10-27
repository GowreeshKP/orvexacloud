// --- Centralized Auth Context ---
// Manages access + refresh token lifecycle for all three roles:
// super_admin (platform console), seller (merchant dashboard), staff (store operator)
//
// Token strategy:
//   - Access token: 15-min JWT, kept in React state (memory only) — never written to localStorage
//   - Refresh token: 30-day JWT, persisted in localStorage — safe because it is server-validated on every use
//   - Silent refresh: automatically fires 60s before access token expires
//   - Page reload: on mount, reads refresh token from localStorage and silently restores the session

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { authService } from '@/api/auth'
import { API_ORIGIN } from '@/api/base'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type AuthRole = 'super_admin' | 'seller' | 'staff' | null

export interface AuthSession {
  userId: string
  name: string
  email: string
  role: AuthRole
  staffRole?: 'staff' | 'manager'
  tenantId?: string
  tenantSlug?: string
  brandName?: string
  loginTime: string
}

interface AuthState {
  accessToken: string | null
  session: AuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

export interface LoginCredentials {
  type: 'seller' | 'admin' | 'staff'
  loginId?: string    // for seller/admin
  password: string
  email?: string      // for staff
  tenantSlug?: string // for staff
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const STORAGE_KEY_REFRESH = 'orvexa_refresh_token'
const API_BASE = API_ORIGIN

// Access token expires in 15 min — auto-refresh 60s before expiry
const REFRESH_BEFORE_MS = 60 * 1000
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1]
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_REFRESH)
  } catch {
    return null
  }
}

function storeRefreshToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_REFRESH, token)
  } catch {
    // Ignore storage errors
  }
}

function clearStoredRefreshToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_REFRESH)
  } catch {
    // Ignore
  }
}

// ─────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  accessToken: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async () => {},
  logout: async () => {},
  clearError: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  })

  // Timer ref for the auto-refresh timeout
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ───────────────────────────────────────────────────────
  // Core: perform token refresh against the server
  // ───────────────────────────────────────────────────────
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    const storedRefresh = getStoredRefreshToken()
    if (!storedRefresh) return null

    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      })

      if (!res.ok) {
        clearStoredRefreshToken()
        setState((prev) => ({ ...prev, accessToken: null, session: null, isAuthenticated: false }))
        return null
      }

      const data = await res.json()
      storeRefreshToken(data.refreshToken)
      return data.accessToken
    } catch {
      return null
    }
  }, [])

  // ───────────────────────────────────────────────────────
  // Schedule the next silent refresh ~60s before expiry
  // ───────────────────────────────────────────────────────
  const scheduleRefresh = useCallback(
    (accessToken: string, sessionData: AuthSession) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)

      const payload = decodeJwtPayload(accessToken)
      const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + ACCESS_TOKEN_TTL_MS
      const delay = Math.max(expiresAt - Date.now() - REFRESH_BEFORE_MS, 5000)

      refreshTimerRef.current = setTimeout(async () => {
        const newToken = await silentRefresh()
        if (newToken) {
          setState((prev) => ({ ...prev, accessToken: newToken }))
          scheduleRefresh(newToken, sessionData)
        } else {
          // Refresh failed — clear auth state
          setState({
            accessToken: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          })
        }
      }, delay)
    },
    [silentRefresh]
  )

  // ───────────────────────────────────────────────────────
  // On mount: attempt silent session restore from stored refresh token
  // ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const storedRefresh = getStoredRefreshToken()
      if (!storedRefresh) {
        setState((prev) => ({ ...prev, isLoading: false }))
        return
      }

      const newAccessToken = await silentRefresh()
      if (cancelled) return

      if (newAccessToken) {
        const payload = decodeJwtPayload(newAccessToken)
        if (payload) {
          const session: AuthSession = {
            userId: payload.userId,
            name: payload.name || payload.email,
            email: payload.email,
            role: payload.role,
            tenantId: payload.tenantId,
            tenantSlug: payload.tenantSlug,
            brandName: payload.brandName,
            loginTime: new Date().toISOString(),
          }
          setState({
            accessToken: newAccessToken,
            session,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          scheduleRefresh(newAccessToken, session)
          return
        }
      }

      setState((prev) => ({ ...prev, isLoading: false }))
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [silentRefresh, scheduleRefresh])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  // ───────────────────────────────────────────────────────
  // login — calls the appropriate auth endpoint based on type
  // ───────────────────────────────────────────────────────
  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        let endpoint = ''
        let body: Record<string, string> = {}

        if (credentials.type === 'seller') {
          endpoint = `/api/auth/seller/login`
          body = { loginId: credentials.loginId!, password: credentials.password }
        } else if (credentials.type === 'admin') {
          endpoint = `/api/auth/admin/login`
          body = { loginId: credentials.loginId!, password: credentials.password }
        } else if (credentials.type === 'staff') {
          endpoint = `/api/auth/staff/login`
          body = {
            tenantSlug: credentials.tenantSlug!,
            email: credentials.email!,
            password: credentials.password,
          }
        }

        const res = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const data = await res.json()

        if (!res.ok) {
          // Check local credentials fallback
          if (credentials.type === 'seller' && credentials.loginId) {
            const localRes = await authService.loginSeller(credentials.loginId, credentials.password)
            if (localRes.success && localRes.session) {
              const session: AuthSession = {
                userId: localRes.session.userId,
                name: localRes.session.name,
                email: localRes.session.email,
                role: 'seller',
                tenantId: localRes.session.tenantId,
                tenantSlug: localRes.session.tenantSlug,
                brandName: localRes.session.brandName,
                loginTime: localRes.session.loginTime,
              }
              setState({
                accessToken: 'local_token_fallback',
                session,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              })
              return
            }
          }

          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: data.error || 'Login failed. Please try again.',
          }))
          return
        }

        storeRefreshToken(data.refreshToken)

        const session: AuthSession = {
          ...data.session,
          name: data.session.name || data.session.email,
        }

        setState({
          accessToken: data.accessToken,
          session,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        })

        scheduleRefresh(data.accessToken, session)
      } catch (err: any) {
        // Fallback for offline / demo mode
        if (credentials.type === 'seller' && credentials.loginId) {
          const localRes = await authService.loginSeller(credentials.loginId, credentials.password)
          if (localRes.success && localRes.session) {
            const session: AuthSession = {
              userId: localRes.session.userId,
              name: localRes.session.name,
              email: localRes.session.email,
              role: 'seller',
              tenantId: localRes.session.tenantId,
              tenantSlug: localRes.session.tenantSlug,
              brandName: localRes.session.brandName,
              loginTime: localRes.session.loginTime,
            }
            setState({
              accessToken: 'local_token_fallback',
              session,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return
          }
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Network error. Please check your connection and try again.',
        }))
      }
    },
    [scheduleRefresh]
  )

  // ───────────────────────────────────────────────────────
  // logout — revokes refresh token server-side, clears state
  // ───────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)

    const storedRefresh = getStoredRefreshToken()

    // Fire-and-forget server-side revocation
    if (storedRefresh) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefresh }),
        })
      } catch {
        // Best-effort — local state is cleared regardless
      }
    }

    clearStoredRefreshToken()

    setState({
      accessToken: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
