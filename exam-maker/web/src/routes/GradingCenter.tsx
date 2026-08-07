import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

export default function GradingCenter() {
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState<Record<string, { score: number; isCorrect: number; notes: string }>>({})

  useEffect(() => {
    fetch(`${API}/api/grading/pending`, { headers }).then(r => r.json()).then(d => {
      setPending(d.pending || [])
      setLoading(false)
    })
  }, [])

  const handleGrade = async (answerId: string) => {
    const g = scoring[answerId]
    if (!g) return
    await fetch(`${API}/api/grading/${answerId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ score: g.score, isCorrect: g.isCorrect, notes: g.notes }),
    })
    setPending(p => p.filter(a => a.id !== answerId))
  }

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">批阅中心</h1>
      {pending.length === 0 ? (
        <div className="text-center py-24 text-gray-400">没有待批阅的题目</div>
      ) : (
        <div className="space-y-4">
          {pending.map((a: any) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">{a.student_name} — {a.exam_title}</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={scoring[a.id]?.score || 0}
                  onChange={e => setScoring(s => ({ ...s, [a.id]: { ...s[a.id], score: Number(e.target.value), isCorrect: Number(e.target.value) > 0 ? 1 : 0, notes: '' } }))}
                  className="w-20 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="得分" />
                <span className="text-sm text-gray-400">/ {a.max_score} 分</span>
                <button onClick={() => handleGrade(a.id)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm">确认</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
