// --- useAuth hook ---
// Thin typed re-export of the AuthContext consumer.
// Usage: const { session, login, logout, isAuthenticated } = useAuth()

export { useAuth } from '@/context/AuthContext'
export type { AuthSession, AuthRole, LoginCredentials } from '@/context/AuthContext'
