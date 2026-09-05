import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import LatexRenderer from '../../components/shared/LatexRenderer'

const API = 'http://localhost:3001'

function countFillBlankMarkers(text: string): number {
  const commandBlanks = (text.match(/\\(?:underline|blank|fillin)\s*(?:\{[^}]*\})?/g) || []).length
  const lineBlanks = (text.match(/(?:_{2,}|＿{2,}|-{4,}|—{2,}|…{2,})/g) || []).length
  return commandBlanks + lineBlanks
}

function inferQuestionBlankCount(question: any): number {
  const explicitCount = countFillBlankMarkers([question?.title, question?.content].map((item) => String(item || '')).join('\n'))
  if (explicitCount > 0) return explicitCount
  const apiCount = Number(question?.blankCount)
  if (Number.isFinite(apiCount) && apiCount > 0) return Math.floor(apiCount)
  const answerCount = Array.isArray(question?.answer?.blanks) ? question.answer.blanks.length : 0
  return Math.max(1, answerCount || 1)
}

export default function ExamTaking() {
  const { publishId } = useParams<{ publishId: string }>()
  const [searchParams] = useSearchParams()
  const submissionId = searchParams.get('sid') || ''
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const [questions, setQuestions] = useState<any[]>([])
  const [publish, setPublish] = useState<any>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [violations, setViolations] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const timerRef = useRef<any>(null)

  // Load exam
  useEffect(() => {
    fetch(`${API}/api/student/exam/${publishId}`, { headers })
      .then(r => r.json()).then(d => {
        if (d.error) {
          setLoadError(d.error)
          return
        }
        setQuestions(d.questions || [])
        setPublish(d.publish)
        setTimeLeft((d.publish?.duration || 0) * 60)
      })
  }, [publishId])

  // Timer
  useEffect(() => {
    if (!publish) return
    timerRef.current = setInterval(() => {
      setTimeLeft((t: number) => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmit(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [publish?.id])

  const reportViolation = (type: string) => {
    if (!publish || publish.antiCheatLevel === 'off' || !submissionId) return
    setViolations((current) => {
      const next = current + 1
      fetch(API + '/api/student/exam/' + publishId + '/events', {
        method: 'POST', headers,
        body: JSON.stringify({ submissionId, type, violations: next, detail: { at: Date.now() } }),
      }).then(r => r.json()).then(d => {
        if (d.shouldSubmit) handleSubmit(next)
      }).catch(() => {})
      return next
    })
  }

  // Fullscreen
  useEffect(() => {
    if (!publish || publish.antiCheatLevel === 'off') return
    const fullscreen = document.documentElement.requestFullscreen
    if (fullscreen) fullscreen().catch(() => {})
    const onFullscreenChange = () => { if (!document.fullscreenElement) reportViolation('fullscreen_exit') }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [publish?.antiCheatLevel, submissionId])

  // Visibility (tab switch) detection
  useEffect(() => {
    if (!publish || publish.antiCheatLevel === 'off') return
    const onVisibility = () => { if (document.hidden) reportViolation('tab_hidden') }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [publish?.antiCheatLevel, submissionId])

  const saveAnswer = useCallback(async (qId: string, order: number, ans: any, maxScore: number) => {
    setAnswers(prev => ({ ...prev, [qId]: ans }))
    await fetch(`${API}/api/student/exam/${publishId}/answer`, {
      method: 'POST', headers,
      body: JSON.stringify({ submissionId, questionId: qId, questionOrder: order, answer: ans, maxScore }),
    })
  }, [publishId, submissionId])

  async function handleSubmit(finalViolations = violations) {
    if (submitting) return
    setSubmitting(true)
    clearInterval(timerRef.current)
    await fetch(`${API}/api/student/exam/${publishId}/submit`, {
      method: 'POST', headers,
      body: JSON.stringify({ submissionId, violations: finalViolations }),
    })
    document.exitFullscreen?.()
    navigate(`/student/submission/${submissionId}`)
  }

  if (loadError) return <div className="text-center py-24 text-gray-400">{loadError}</div>
  if (questions.length === 0) return <div className="text-center py-24 text-gray-400">加载试卷...</div>

  const q = questions[currentIdx]
  const fillBlankCount = q.type === 'fillblank' ? inferQuestionBlankCount(q) : 0
  const answeredCount = Object.keys(answers).length
  const fmtTime = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
        <span className="font-semibold">{publish?.title}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{answeredCount}/{questions.length} 已答</span>
          <span className={`font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-gray-700'}`}>{fmtTime}</span>
          {publish?.antiCheatLevel !== 'off' && violations > 0 && <span className="text-xs text-red-500">异常: {violations}/{publish?.maxViolations || 3}</span>}
          <button onClick={() => handleSubmit()} disabled={submitting} className="px-4 py-1.5 bg-red-500 text-white rounded-lg text-sm">{submitting ? '提交中...' : '交卷'}</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 bg-white border-r p-4 overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            {questions.map((q, i) => (
              <button key={i} onClick={() => setCurrentIdx(i)} className={`w-12 h-12 rounded-lg text-sm font-medium ${
                i === currentIdx ? 'ring-2 ring-indigo-400 bg-indigo-50' :
                answers[q.id] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 min-w-0 min-h-0 p-8 overflow-y-auto">
          <div className="w-full max-w-3xl mx-auto bg-white rounded-xl border p-8 overflow-visible">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-bold text-indigo-600">第 {currentIdx + 1} 题</span>
              <span className="text-sm text-gray-400">({q.score} 分)</span>
            </div>
            <LatexRenderer content={q.title} className="student-exam-latex text-lg font-semibold text-gray-900 mb-4" />
            <LatexRenderer content={q.content} className="student-exam-latex text-gray-700 mb-6" />

            {/* Choice */}
            {q.type === 'choice' && q.options && (
              <div className="space-y-3">
                {q.options.map((opt: any) => (
                  <label key={opt.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    answers[q.id]?.selectedOptionId === opt.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                  }`}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.selectedOptionId === opt.id}
                      onChange={() => saveAnswer(q.id, currentIdx + 1, { type: 'choice', selectedOptionId: opt.id }, q.score)}
                      className="mt-1 flex-shrink-0"
                    />
                    <span className="font-medium text-gray-500 flex-shrink-0">{opt.label}.</span>
                    <LatexRenderer content={opt.content} className="student-exam-latex min-w-0 flex-1" />
                  </label>
                ))}
              </div>
            )}

            {/* True/False */}
            {q.type === 'truefalse' && (
              <div className="flex gap-4">
                {[true, false].map(v => (
                  <label key={String(v)} className={`flex-1 p-4 rounded-lg border text-center cursor-pointer ${
                    answers[q.id]?.value === v ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                  }`}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.value === v}
                      onChange={() => saveAnswer(q.id, currentIdx + 1, { type: 'truefalse', value: v }, q.score)}
                      className="hidden"
                    />
                    <span className="font-medium">{v ? '✓ 正确' : '✗ 错误'}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Fill blank */}
            {q.type === 'fillblank' && (
              <div className="space-y-3">
                {Array.from({ length: fillBlankCount }, (_, i) => i).map(i => (
                  <input key={i} value={answers[q.id]?.blanks?.[i] || ''}
                    onChange={e => {
                      const currentBlanks = answers[q.id]?.blanks || []
                      const blanks = Array.from({ length: fillBlankCount }, (_, idx) => currentBlanks[idx] || '')
                      blanks[i] = e.target.value
                      saveAnswer(q.id, currentIdx + 1, { type: 'fillblank', blanks }, q.score)
                    }}
                    placeholder={fillBlankCount === 1 ? '答案' : '空格 ' + (i + 1)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                ))}
              </div>
            )}

            {/* Essay */}
            {q.type === 'essay' && (
              <textarea value={answers[q.id]?.referenceAnswer || ''}
                onChange={e => saveAnswer(q.id, currentIdx + 1, { type: 'essay', referenceAnswer: e.target.value }, q.score)}
                rows={6} placeholder="请输入答案...（支持上传图片）"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
              />
            )}

            {/* Nav */}
            <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
              <button onClick={() => setCurrentIdx(i => i - 1)} disabled={currentIdx === 0}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-30">上一题</button>
              <button onClick={() => setCurrentIdx(i => i + 1)} disabled={currentIdx >= questions.length - 1}
                className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg disabled:opacity-30">下一题</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
