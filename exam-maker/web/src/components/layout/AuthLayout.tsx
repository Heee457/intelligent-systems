import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">📝 exam-maker</h1>
          <p className="text-gray-500 mt-2 text-sm">在线组卷与考试平台</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
