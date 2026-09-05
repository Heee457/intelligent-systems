import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import LatexRenderer from '../../components/shared/LatexRenderer'

const API = 'http://localhost:3001'

function statusLabel(status: string) {
  if (status === 'graded') return '已批阅'
  if (status === 'submitted') return '待批阅'
  return '进行中'
}

function statusClass(status: string) {
  if (status === 'graded') return 'bg-green-100 text-green-700'
  if (status === 'submitted') return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}

function scoreText(item: any) {
  if (!item.scoreVisible) return '待公布'
  return String(item.total_score ?? '—') + ' / ' + String(item.total_points ?? '—')
}

export default function StudentGrades() {
  const [submissions, setSubmissions] = useState<any[]>([])
  const [weakPoints, setWeakPoints] = useState<any[]>([])
  const [mistakes, setMistakes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const token = useAuthStore(s => s.token)

  useEffect(() => {
    const headers = { Authorization: 'Bearer ' + token }
    Promise.all([
      fetch(API + '/api/student/submissions', { headers }).then(r => r.json()),
      fetch(API + '/api/student/mistakes', { headers }).then(r => r.json()),
    ]).then(([submissionData, mistakeData]) => {
      setSubmissions(submissionData.submissions || [])
      setWeakPoints(mistakeData.weakPoints || [])
      setMistakes(mistakeData.mistakes || [])
      setLoading(false)
    })
  }, [token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">我的成绩</h1>

      {submissions.length === 0 ? (
        <div className="text-center py-24 text-gray-400">暂无考试记录</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {submissions.map((item: any) => (
            <Link key={item.id} to={'/student/submission/' + item.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{item.exam_title}</p>
                <p className="text-xs text-gray-400">{new Date(item.started_at).toLocaleString('zh-CN')}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{scoreText(item)}</p>
                <span className={'text-xs px-2 py-0.5 rounded-full ' + statusClass(item.status)}>{statusLabel(item.status)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {weakPoints.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">薄弱知识点</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {weakPoints.slice(0, 6).map((item: any) => (
              <div key={item.knowledgePoint} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-gray-800">{item.knowledgePoint}</span>
                  <span className="text-gray-400">掌握 {item.masteryRate}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={item.masteryRate >= 80 ? 'h-full bg-green-500' : item.masteryRate >= 60 ? 'h-full bg-yellow-500' : 'h-full bg-red-500'} style={{ width: item.masteryRate + '%' }} />
                </div>
                <p className="text-xs text-gray-400 mt-2">错题 {item.mistakeCount} 道 · 失分 {Math.round(item.lostScore * 10) / 10}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {mistakes.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">错题回顾</h2>
          <div className="space-y-4">
            {mistakes.slice(0, 12).map((item: any) => (
              <div key={item.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.examTitle}</p>
                    <p className="text-xs text-gray-400">第 {item.questionOrder} 题 · {item.score} / {item.maxScore} 分</p>
                  </div>
                  <Link to={'/student/submission/' + item.submissionId} className="text-xs px-2.5 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100">查看详情</Link>
                </div>
                <LatexRenderer content={item.question?.title} className="text-sm font-medium text-gray-800" />
                <LatexRenderer content={item.question?.content} className="text-sm text-gray-500 mt-1" />
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">我的答案</p>
                    <p className="whitespace-pre-wrap break-words">{item.studentAnswerText}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">参考答案</p>
                    <p className="whitespace-pre-wrap break-words">{item.answerVisible ? item.referenceAnswerText : '暂未公布'}</p>
                  </div>
                </div>
                {item.teacherNotes && <p className="mt-2 text-xs text-indigo-600">教师批注：{item.teacherNotes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
