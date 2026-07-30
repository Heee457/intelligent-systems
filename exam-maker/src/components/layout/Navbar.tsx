import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/questions', label: '题库' },
  { to: '/generator', label: '组卷' },
  { to: '/exams', label: '试卷' },
  { to: '/history', label: '历史' },
]

export default function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-1">
      <span className="text-xl font-bold text-indigo-600 mr-6">📝 exam-maker</span>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
