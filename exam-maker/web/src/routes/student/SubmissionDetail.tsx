import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/student/submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [id, token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>
  if (!data?.submission) return <div className="text-center py-24 text-gray-400">未找到</div>

  const { submission, answers } = data

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{submission.exam_title}</h1>
          <p className="text-sm text-gray-400">{new Date(submission.submitted_at).toLocaleString('zh-CN')}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-indigo-600">{submission.total_score} / {submission.total_points}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            submission.status === 'graded' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>{submission.status === 'graded' ? '已批阅' : '待批阅'}</span>
        </div>
      </div>

      <div className="space-y-6">
        {answers.map((a: any, i: number) => (
          <div key={i} className={`bg-white rounded-xl border p-5 ${
            a.is_correct === 1 ? 'border-green-200' : a.is_correct === 0 ? 'border-red-200' : 'border-yellow-200'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-gray-500">第 {a.question_order} 题</span>
                  <span className="text-xs text-gray-400">({a.score} / {a.max_score} 分)</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    a.is_correct === 1 ? 'bg-green-100 text-green-700' :
                    a.is_correct === 0 ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.is_correct === 1 ? '✓' : a.is_correct === 0 ? '✗' : '待批阅'}
                  </span>
                </div>
                {a.question && (
                  <>
                    <p className="text-sm font-medium text-gray-700">{a.question.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{a.question.content}</p>
                    {a.question.type === 'choice' && a.question.options && (
                      <div className="mt-2 space-y-1">
                        {a.question.options.map((opt: any) => (
                          <p key={opt.id} className={`text-sm ${opt.id === a.studentAnswer?.selectedOptionId ? 'font-bold' : ''} ${opt.id === a.question.answer?.selectedOptionId ? 'text-green-600' : ''}`}>
                            {opt.label}. {opt.content}
                            {opt.id === a.question.answer?.selectedOptionId && ' ← 正确答案'}
                            {opt.id === a.studentAnswer?.selectedOptionId && opt.id !== a.question.answer?.selectedOptionId && ' ← 你的答案'}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
