import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  role?: 'teacher' | 'student'
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { token, user } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (role && user.role !== role) {
    const redirectTo = user.role === 'teacher' ? '/' : '/student/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
