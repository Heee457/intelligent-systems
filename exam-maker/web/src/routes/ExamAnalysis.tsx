import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useExamStore } from '../store/examStore'
import type { Exam } from '../types'

const API = 'http://localhost:3001'

const TYPE_LABELS: Record<string, string> = {
  choice: '选择题',
  truefalse: '判断题',
  fillblank: '填空题',
  essay: '问答题',
  match: '匹配题',
  ordering: '排序题',
}

function levelLabel(level: string) {
  if (level === 'good') return '稳定'
  if (level === 'watch') return '关注'
  return '薄弱'
}

function levelClass(level: string) {
  if (level === 'good') return 'bg-green-100 text-green-700'
  if (level === 'watch') return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

export default function ExamAnalysis() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const { generateRemedialExam, generationWarnings } = useExamStore()
  const headers = { Authorization: 'Bearer ' + token }
  const [publish, setPublish] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [knowledgePoints, setKnowledgePoints] = useState<any[]>([])
  const [selectedKnowledgePoints, setSelectedKnowledgePoints] = useState<string[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<'practice' | 'retake' | null>(null)
  const [generatedExam, setGeneratedExam] = useState<Exam | null>(null)
  const [generateError, setGenerateError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch(API + '/api/publish/' + id, { headers }).then(r => r.ok ? r.json() : null),
      fetch(API + '/api/stats/exam/' + id, { headers }).then(r => r.json()),
      fetch(API + '/api/stats/exam/' + id + '/questions', { headers }).then(r => r.json()),
      fetch(API + '/api/stats/exam/' + id + '/knowledge', { headers }).then(r => r.json()),
      fetch(API + '/api/stats/exam/' + id + '/events', { headers }).then(r => r.json()),
    ]).then(([p, s, q, k, e]) => {
      if (cancelled) return
      const kps = k.knowledgePoints || []
      setPublish(p?.publish || null)
      setStats(s.stats)
      setQuestions(q.questions || [])
      setKnowledgePoints(kps)
      setSelectedKnowledgePoints(kps.filter((item: any) => item.level !== 'good').slice(0, 3).map((item: any) => item.knowledgePoint))
      setEvents(e.events || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id, token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>
  if (!stats) return <div className="text-center py-24 text-gray-400">暂无数据</div>

  const dist = stats.score_dist ? JSON.parse(stats.score_dist) : {}
  const maxPoints = stats.max_points ?? stats.total_points ?? '-'
  const backExamId = publish?.exam_id || publish?.examId
  const canGenerate = selectedKnowledgePoints.length > 0 && !generating

  const toggleKnowledgePoint = (kp: string) => {
    setSelectedKnowledgePoints((prev) => prev.includes(kp) ? prev.filter((item) => item !== kp) : [...prev, kp])
  }

  const handleGenerate = async (mode: 'practice' | 'retake') => {
    if (!id || selectedKnowledgePoints.length === 0) return
    setGenerating(mode)
    setGeneratedExam(null)
    setGenerateError('')
    const exam = await generateRemedialExam({
      publishId: id,
      mode,
      knowledgePoints: selectedKnowledgePoints,
      maxQuestions: mode === 'retake' ? 10 : 8,
    })
    setGenerating(null)
    if (!exam) {
      setGenerateError('生成失败，请检查目标知识点是否有可用题目')
      return
    }
    setGeneratedExam(exam)
  }

  return (
    <div className="space-y-6">
      <Link to={backExamId ? '/exams/' + backExamId : '/exams'} className="text-sm text-indigo-600 mb-4 inline-block">← 返回试卷</Link>
      <h1 className="text-2xl font-bold text-gray-900">试卷分析</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="参与人数" value={stats.student_count} />
        <StatCard label="平均分" value={String(stats.avg_score) + '/' + String(maxPoints)} />
        <StatCard label="中位数" value={stats.median_score} />
        <StatCard label="及格率" value={String(stats.pass_rate) + '%'} />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Object.entries(dist).map(([key, value]: any) => (
          <div key={key} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-xs text-gray-400">{key}</div>
            <div className="text-lg font-bold">{value}人</div>
          </div>
        ))}
      </div>

      {knowledgePoints.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold">知识点掌握情况</h3>
              <p className="text-xs text-gray-400 mt-1">已选 {selectedKnowledgePoints.length} 个知识点</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleGenerate('practice')}
                disabled={!canGenerate}
                className="px-3 py-1.5 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {generating === 'practice' ? '生成中...' : '生成补救练习'}
              </button>
              <button
                onClick={() => handleGenerate('retake')}
                disabled={!canGenerate}
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                {generating === 'retake' ? '生成中...' : '生成重测试卷'}
              </button>
            </div>
          </div>

          {(generatedExam || generateError) && (
            <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
              {generatedExam && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-indigo-900">已生成：{generatedExam.title}</span>
                  <Link to={'/exams/' + generatedExam.id} className="text-indigo-600 hover:text-indigo-800">查看试卷</Link>
                </div>
              )}
              {generateError && <p className="text-red-600">{generateError}</p>}
              {generatedExam && generationWarnings.map((warning) => <p key={warning} className="text-amber-700 mt-1">{warning}</p>)}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {knowledgePoints.map((item: any) => {
              const selected = selectedKnowledgePoints.includes(item.knowledgePoint)
              return (
                <label key={item.knowledgePoint} className={'block border rounded-lg p-3 cursor-pointer transition-colors ' + (selected ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 hover:border-gray-200')}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleKnowledgePoint(item.knowledgePoint)}
                        className="w-4 h-4 accent-indigo-500 shrink-0"
                      />
                      <span className="font-medium text-sm text-gray-800 truncate">{item.knowledgePoint}</span>
                    </div>
                    <span className={'text-xs px-2 py-0.5 rounded-full shrink-0 ' + levelClass(item.level)}>{levelLabel(item.level)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={item.avgScoreRate >= 80 ? 'h-full bg-green-500' : item.avgScoreRate >= 60 ? 'h-full bg-yellow-500' : 'h-full bg-red-500'} style={{ width: item.avgScoreRate + '%' }} />
                    </div>
                    <span className="text-sm font-mono text-gray-600">{item.avgScoreRate}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{item.questionCount} 道题 · {item.answerCount} 次作答 · 失分 {item.lostScore}</p>
                  {item.examples?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.examples.map((example: any) => (
                        <p key={example.questionId} className="text-xs text-gray-500 truncate">{example.title}（{example.score}/{example.maxScore}）</p>
                      ))}
                    </div>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 p-5">
          <h3 className="font-semibold mb-4 text-amber-800">考试异常记录</h3>
          <div className="space-y-2 text-sm">
            {events.map((event: any) => (
              <div key={event.id} className="flex items-center justify-between border-b border-amber-50 pb-2 last:border-0 last:pb-0">
                <span>{event.student_name}：{event.type}</span>
                <span className="text-xs text-gray-400">{new Date(event.created_at).toLocaleString('zh-CN')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-4">逐题分析</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">题目</th>
              <th>得分率</th>
              <th>正确率</th>
              <th>正确/错误/空答</th>
              <th>区分度</th>
              <th>评价</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question: any) => (
              <tr key={question.question_id} className="border-b border-gray-50 align-top">
                <td className="py-2 pr-3">
                  <p className="font-medium text-gray-800 line-clamp-2">{question.title || question.question_id.slice(0, 8)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="text-xs text-gray-400">{TYPE_LABELS[question.type] || question.type}</span>
                    {question.knowledgePoints?.slice(0, 2).map((kp: string) => <span key={kp} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{kp}</span>)}
                  </div>
                </td>
                <td className="py-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full">
                    <div className={question.score_rate >= 80 ? 'h-2 rounded-full bg-green-500' : question.score_rate >= 60 ? 'h-2 rounded-full bg-yellow-500' : 'h-2 rounded-full bg-red-500'} style={{ width: question.score_rate + '%' }} />
                  </div>
                  <span className="text-xs">{question.score_rate}%</span>
                </td>
                <td className="py-2">{question.correct_rate}%</td>
                <td className="py-2 text-xs">{question.correct_count}/{question.wrong_count}/{question.blank_count}</td>
                <td className={question.discrimination >= 0.4 ? 'py-2 font-mono text-green-600' : question.discrimination >= 0.2 ? 'py-2 font-mono text-yellow-600' : 'py-2 font-mono text-red-600'}>{question.discrimination}</td>
                <td className="py-2 text-xs">{question.reviewFlag ? '需复核' : '正常'}</td>
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
