import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function StudentLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-1">
        <span className="text-xl font-bold text-indigo-600 mr-6">📝 exam-maker</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            退出
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
