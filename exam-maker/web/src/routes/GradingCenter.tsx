import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import LatexRenderer from '../components/shared/LatexRenderer'

const API = 'http://localhost:3001'

type GradeDraft = {
  score: number
  isCorrect: number
  notes: string
  useAiSuggestion?: boolean
}

const TYPE_LABELS: Record<string, string> = {
  choice: '选择题',
  truefalse: '判断题',
  fillblank: '填空题',
  essay: '问答题',
  match: '匹配题',
  ordering: '排序题',
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}

function clampScore(value: number, maxScore: number) {
  return Math.max(0, Math.min(maxScore, Number.isFinite(value) ? value : 0))
}

export default function GradingCenter() {
  const token = useAuthStore(s => s.token)
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState<Record<string, GradeDraft>>({})

  const loadPending = async () => {
    setLoading(true)
    const res = await fetch(API + '/api/grading/pending', { headers })
    const data = await res.json()
    const rows = data.pending || []
    setPending(rows)
    setScoring((prev) => {
      const next = { ...prev }
      rows.forEach((item: any) => {
        if (!next[item.id]) {
          const suggested = Number(item.aiSuggestion?.score ?? item.score ?? 0)
          next[item.id] = {
            score: clampScore(suggested, Number(item.maxScore) || 0),
            isCorrect: suggested >= Number(item.maxScore || 0) ? 1 : 0,
            notes: item.teacherNotes || item.aiSuggestion?.feedback || '',
            useAiSuggestion: Boolean(item.aiSuggestion),
          }
        }
      })
      return next
    })
    setLoading(false)
  }

  useEffect(() => { loadPending() }, [])

  const updateDraft = (answerId: string, patch: Partial<GradeDraft>) => {
    setScoring((prev) => ({
      ...prev,
      [answerId]: { ...(prev[answerId] || { score: 0, isCorrect: 0, notes: '' }), ...patch },
    }))
  }

  const applyScore = (item: any, score: number, useAiSuggestion = false) => {
    const finalScore = clampScore(score, Number(item.maxScore) || 0)
    updateDraft(item.id, {
      score: finalScore,
      isCorrect: finalScore >= Number(item.maxScore || 0) ? 1 : 0,
      notes: useAiSuggestion && item.aiSuggestion?.feedback ? item.aiSuggestion.feedback : scoring[item.id]?.notes || '',
      useAiSuggestion,
    })
  }

  const handleGrade = async (item: any) => {
    const draft = scoring[item.id]
    if (!draft) return
    await fetch(API + '/api/grading/' + item.id, {
      method: 'PUT', headers,
      body: JSON.stringify(draft),
    })
    setPending(p => p.filter(a => a.id !== item.id))
  }

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">批阅中心</h1>
          <p className="text-sm text-gray-400 mt-1">{pending.length} 道题待人工确认</p>
        </div>
        <button onClick={loadPending} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">刷新</button>
      </div>

      {pending.length === 0 ? (
        <div className="text-center py-24 text-gray-400">没有待批阅的题目</div>
      ) : (
        <div className="space-y-4">
          {pending.map((item: any) => {
            const draft = scoring[item.id] || { score: 0, isCorrect: 0, notes: '' }
            const suggestion = item.aiSuggestion
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-gray-900">{item.studentName}</span>
                      <span className="text-gray-300">/</span>
                      <span className="text-gray-600">{item.examTitle}</span>
                      {item.submittedLate && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">迟交</span>}
                      {item.violations > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">异常 {item.violations} 次</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">提交：{formatTime(item.submittedAt)} · 第 {item.questionOrder} 题</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{TYPE_LABELS[item.question?.type] || item.question?.type}</span>
                    <span>{DIFFICULTY_LABELS[item.question?.difficulty] || item.question?.difficulty}</span>
                    <span>{item.maxScore} 分</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <LatexRenderer content={item.question?.title} className="font-semibold text-gray-900" />
                  <LatexRenderer content={item.question?.content} className="text-sm text-gray-700" />
                  {item.question?.knowledgePoints?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.question.knowledgePoints.map((kp: string) => <span key={kp} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">{kp}</span>)}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">学生答案</h3>
                    <div className="min-h-24 bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {item.studentAnswerText}
                    </div>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">参考答案</h3>
                    <div className="min-h-24 bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {item.referenceAnswerText}
                    </div>
                  </section>
                </div>

                {item.question?.explanation && (
                  <div className="text-sm text-gray-600 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                    <span className="font-medium text-indigo-700">解析：</span>{item.question.explanation}
                  </div>
                )}

                {suggestion && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-emerald-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">AI 建议：{suggestion.score} / {item.maxScore} 分 · 置信度 {Math.round((suggestion.confidence || 0) * 100)}%</span>
                      <button type="button" onClick={() => applyScore(item, Number(suggestion.score) || 0, true)} className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded text-xs hover:bg-emerald-200">采用建议</button>
                    </div>
                    <p className="mt-1 text-emerald-800">{suggestion.feedback}</p>
                    {(suggestion.matchedKeywords?.length > 0 || suggestion.missingKeywords?.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {suggestion.matchedKeywords?.length > 0 && <span>命中：{suggestion.matchedKeywords.join('、')}</span>}
                        {suggestion.missingKeywords?.length > 0 && <span>缺失：{suggestion.missingKeywords.join('、')}</span>}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-3 items-start pt-2 border-t border-gray-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      value={draft.score}
                      min={0}
                      max={item.maxScore}
                      step={0.5}
                      onChange={e => applyScore(item, Number(e.target.value), draft.useAiSuggestion)}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <span className="text-sm text-gray-400">/ {item.maxScore} 分</span>
                    <button onClick={() => applyScore(item, 0)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">0 分</button>
                    <button onClick={() => applyScore(item, Number(item.maxScore) / 2)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">半分</button>
                    <button onClick={() => applyScore(item, Number(item.maxScore))} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">满分</button>
                  </div>

                  <textarea
                    value={draft.notes}
                    onChange={e => updateDraft(item.id, { notes: e.target.value })}
                    rows={3}
                    placeholder="批注"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                  />

                  <button onClick={() => handleGrade(item)} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 whitespace-nowrap">
                    确认批阅
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
