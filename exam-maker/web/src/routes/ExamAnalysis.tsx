import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

export default function ExamAnalysis() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: `Bearer ${token}` }
  const [stats, setStats] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/stats/exam/${id}`, { headers }).then(r => r.json()),
      fetch(`${API}/api/stats/exam/${id}/questions`, { headers }).then(r => r.json()),
    ]).then(([s, q]) => {
      setStats(s.stats)
      setQuestions(q.questions || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>
  if (!stats) return <div className="text-center py-24 text-gray-400">暂无数据</div>

  const dist = stats.score_dist ? JSON.parse(stats.score_dist) : {}

  return (
    <div className="space-y-6">
      <Link to={`/exams/${id}`} className="text-sm text-indigo-600 mb-4 inline-block">← 返回试卷</Link>
      <h1 className="text-2xl font-bold text-gray-900">试卷分析</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="参与人数" value={stats.student_count} />
        <StatCard label="平均分" value={`${stats.avg_score}/${stats.max_points}`} />
        <StatCard label="中位数" value={stats.median_score} />
        <StatCard label="及格率" value={`${stats.pass_rate}%`} />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Object.entries(dist).map(([k, v]: any) => (
          <div key={k} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-xs text-gray-400">{k}</div>
            <div className="text-lg font-bold">{v}人</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-4">逐题分析</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">题号</th>
              <th>正确率</th>
              <th>正确/错误/空答</th>
              <th>区分度</th>
              <th>评价</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q: any) => (
              <tr key={q.question_id} className="border-b border-gray-50">
                <td className="py-2">{q.question_id.slice(0, 8)}</td>
                <td>
                  <div className="w-24 h-2 bg-gray-100 rounded-full">
                    <div className={`h-2 rounded-full ${q.correct_rate >= 80 ? 'bg-green-500' : q.correct_rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${q.correct_rate}%` }} />
                  </div>
                  <span className="text-xs">{q.correct_rate}%</span>
                </td>
                <td className="text-xs">{q.correct_count}/{q.wrong_count}/{q.blank_count}</td>
                <td className={`font-mono ${q.discrimination >= 0.4 ? 'text-green-600' : q.discrimination >= 0.2 ? 'text-yellow-600' : 'text-red-600'}`}>{q.discrimination}</td>
                <td className="text-xs">{q.discrimination >= 0.4 ? '优秀' : q.discrimination >= 0.2 ? '一般' : '需改进'}{q.discrimination >= 0.6 ? ' ⚠ 注意' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  )
}
