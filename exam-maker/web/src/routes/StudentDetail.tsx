import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const [submissions, setSubmissions] = useState<any[]>([])

  useEffect(() => {
    fetch(`${API}/api/student/submissions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        // Filter to this student (admin view)
        setSubmissions((d.submissions || []).filter((s: any) => s.student_id === id))
      })
  }, [id])

  // For now show what we can
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">学生详情</h1>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {submissions.map((s: any) => (
          <Link key={s.id} to={`/student/submission/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
            <div>
              <p className="font-medium">{s.exam_title}</p>
              <p className="text-xs text-gray-400">{new Date(s.started_at).toLocaleString('zh-CN')}</p>
            </div>
            <span className="font-semibold">{s.total_score}/{s.total_points}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
