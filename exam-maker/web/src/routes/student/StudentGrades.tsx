import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

export default function StudentGrades() {
  const [submissions, setSubmissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const token = useAuthStore(s => s.token)

  useEffect(() => {
    fetch(`${API}/api/student/submissions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setSubmissions(d.submissions || []); setLoading(false) })
  }, [token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">我的成绩</h1>
      {submissions.length === 0 ? (
        <div className="text-center py-24 text-gray-400">暂无考试记录</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {submissions.map((s: any) => (
            <Link key={s.id} to={`/student/submission/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{s.exam_title}</p>
                <p className="text-xs text-gray-400">{new Date(s.started_at).toLocaleString('zh-CN')}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{s.total_score ?? '—'} / {s.total_points}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  s.status === 'graded' ? 'bg-green-100 text-green-700' :
                  s.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {s.status === 'graded' ? '已批阅' : s.status === 'submitted' ? '待批阅' : '进行中'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
