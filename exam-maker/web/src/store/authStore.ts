import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  role: 'teacher' | 'student'
  avatar_url?: string
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null

  login: (username: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, role: 'teacher' | 'student') => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  clearError: () => void
}

const API_BASE = 'http://localhost:3001'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      login: async (username, password) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '登录失败')
          set({ token: data.token, user: data.user, loading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '未知错误', loading: false })
          throw err
        }
      },

      register: async (email, password, name, role) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '注册失败')
          set({ token: data.token, user: data.user, loading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '未知错误', loading: false })
          throw err
        }
      },

      logout: () => {
        set({ user: null, token: null, error: null })
      },

      fetchMe: async () => {
        const { token } = get()
        if (!token) return
        set({ loading: true })
        try {
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) {
            set({ user: null, token: null })
            return
          }
          const data = await res.json()
          set({ user: data.user, loading: false })
        } catch {
          set({ loading: false })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'exam-maker-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
