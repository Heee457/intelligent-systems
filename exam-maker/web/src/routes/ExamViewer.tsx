import { useParams, useNavigate } from 'react-router-dom'
import { useExamStore } from '../store/examStore'
import { useQuestionStore } from '../store/questionStore'
import { useAuthStore } from '../store/authStore'
import { useEffect, useState } from 'react'
import Modal from '../components/shared/Modal'
import QuestionForm from '../components/questions/QuestionForm'
import LatexRenderer from '../components/shared/LatexRenderer'
import PublishManagementPanel from '../components/exams/PublishManagementPanel'
import type { ExamQuestion } from '../types'

const API = 'http://localhost:3001'

type TeacherClass = {
  id: string
  name: string
  join_code?: string
  studentCount?: number
}

export default function ExamViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { exams, updateExam, createExamVersion } = useExamStore()
  const { questions } = useQuestionStore()

  const exam = exams.find((e) => e.id === id)
  const examId = exam?.id

  const [editTitle, setEditTitle] = useState(false)
  const [title, setTitle] = useState(exam?.title ?? '')
  const [editingQId, setEditingQId] = useState<string | null>(null)

  // 发布弹窗状态
  const [showPublish, setShowPublish] = useState(false)
  const [publishTitle, setPublishTitle] = useState(exam?.title ?? '')
  const [publishDuration, setPublishDuration] = useState('')
  const [publishClassIds, setPublishClassIds] = useState<string[]>([])
  const [classes, setClasses] = useState<TeacherClass[]>([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [classesError, setClassesError] = useState<string | null>(null)
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [publishStartTime, setPublishStartTime] = useState('')
  const [publishEndTime, setPublishEndTime] = useState('')
  const [scoreReleaseMode, setScoreReleaseMode] = useState<'auto' | 'fixed'>('auto')
  const [scoreReleaseTime, setScoreReleaseTime] = useState('')
  const [answerReleaseTime, setAnswerReleaseTime] = useState('')
  const [publishRetry, setPublishRetry] = useState('0')
  const [allowLateSubmit, setAllowLateSubmit] = useState(false)
  const [antiCheatLevel, setAntiCheatLevel] = useState<'off' | 'record' | 'strict'>('record')
  const [maxViolations, setMaxViolations] = useState('3')
  const [publishes, setPublishes] = useState<any[]>([])
  const [qualityReport, setQualityReport] = useState<any | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [versions, setVersions] = useState<any[]>([])
  const [previewMode, setPreviewMode] = useState<'student' | 'answer' | null>(null)

  const authHeaders = (): Record<string, string> => {
    const token = useAuthStore.getState().token
    return token ? { Authorization: 'Bearer ' + token } : {}
  }

  const refreshPublishes = async () => {
    if (!examId) return
    const res = await fetch(API + '/api/publish', { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json()
    setPublishes((data.publishes || []).filter((item: any) => item.exam_id === examId))
  }

  const refreshQuality = async () => {
    if (!examId) return null
    setQualityLoading(true)
    try {
      const res = await fetch(API + '/api/exams/' + examId + '/quality', { headers: authHeaders() })
      if (!res.ok) return null
      const data = await res.json()
      setQualityReport(data.report)
      return data.report
    } finally {
      setQualityLoading(false)
    }
  }

  const refreshVersions = async () => {
    if (!examId) return
    const res = await fetch(API + '/api/exams/' + examId + '/versions', { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json()
    setVersions(data.versions || [])
  }

  useEffect(() => {
    refreshPublishes()
    refreshQuality()
    refreshVersions()
  }, [examId])

  useEffect(() => {
    if (!showPublish) return
    let cancelled = false

    async function fetchClasses() {
      const token = useAuthStore.getState().token
      setClassesLoading(true)
      setClassesError(null)
      try {
        const res = await fetch(`${API}/api/classes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`班级加载失败 (${res.status})`)
        const data = await res.json()
        if (!cancelled) setClasses(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) setClassesError(err instanceof Error ? err.message : '班级加载失败')
      } finally {
        if (!cancelled) setClassesLoading(false)
      }
    }

    fetchClasses()
    return () => { cancelled = true }
  }, [showPublish])

  if (!exam) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-lg">试卷不存在</p>
        <button onClick={() => navigate('/exams')} className="mt-4 text-indigo-500 hover:text-indigo-700 text-sm">返回试卷列表</button>
      </div>
    )
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]))
  const lockedByPublish = publishes.length > 0 || Boolean(exam.lockedAt)
  const qualityStatus = qualityReport?.canPublish ? '可发布' : '需修复'

  const answerText = (q: any) => {
    const answer = q?.answer
    if (!answer) return '—'
    if (answer.type === 'choice') return q.options?.find((opt: any) => opt.id === answer.selectedOptionId)?.label || answer.selectedOptionId || '—'
    if (answer.type === 'truefalse') return answer.value ? '正确' : '错误'
    if (answer.type === 'fillblank') return (answer.blanks || []).join('；') || '—'
    if (answer.type === 'essay') return answer.referenceAnswer || '—'
    if (answer.type === 'match') return (answer.pairs || []).map((p: any) => p.left + ' - ' + p.right).join('；') || '—'
    if (answer.type === 'ordering') return (answer.orderedItems || []).join(' → ') || '—'
    return '—'
  }

  const updateExamSafely = async (data: Partial<typeof exam>) => {
    try {
      await updateExam(exam.id, data as any)
      await refreshQuality()
      await refreshVersions()
      return true
    } catch (err) {
      alert(err instanceof Error ? err.message : '试卷更新失败')
      return false
    }
  }

  const handleCreateVersion = async () => {
    const next = await createExamVersion(exam.id)
    if (!next) {
      alert('复制新版本失败')
      return
    }
    await refreshVersions()
    navigate('/exams/' + next.id)
  }

  const handleTitleSave = async () => {
    if (lockedByPublish) {
      alert('已发布试卷不能直接修改内容，请复制为新版本后再编辑')
      setEditTitle(false)
      setTitle(exam.title)
      return
    }
    if (title.trim()) {
      await updateExamSafely({ title: title.trim() } as any)
    }
    setEditTitle(false)
  }

  // 新 store 无 reorderExamQuestions/setQuestionScore，用 updateExam 组合实现
  const saveQuestions = async (questions: ExamQuestion[]) => {
    if (lockedByPublish) {
      alert('已发布试卷不能直接修改内容，请复制为新版本后再编辑')
      return
    }
    await updateExamSafely({ questions, totalScore: questions.reduce((sum, q) => sum + q.score, 0) } as any)
  }

  const handleMoveUp = (qid: string) => {
    const questions = [...exam.questions].sort((a, b) => a.order - b.order)
    const idx = questions.findIndex((q) => q.questionId === qid)
    if (idx <= 0) return
    ;[questions[idx - 1], questions[idx]] = [questions[idx], questions[idx - 1]]
    saveQuestions(questions.map((q, i) => ({ ...q, order: i + 1 })))
  }

  const handleMoveDown = (qid: string) => {
    const questions = [...exam.questions].sort((a, b) => a.order - b.order)
    const idx = questions.findIndex((q) => q.questionId === qid)
    if (idx < 0 || idx >= questions.length - 1) return
    ;[questions[idx], questions[idx + 1]] = [questions[idx + 1], questions[idx]]
    saveQuestions(questions.map((q, i) => ({ ...q, order: i + 1 })))
  }

  const handleScoreChange = (qid: string, score: number) => {
    const questions = exam.questions.map((q) => (q.questionId === qid ? { ...q, score } : q))
    saveQuestions(questions)
  }

  const handlePrint = () => {
    window.print()
  }

  const openPublishModal = () => {
    setPublishTitle(exam.title)
    setPublishDuration('')
    setPublishClassIds([])
    setShuffleQuestions(false)
    setPublishStartTime('')
    setPublishEndTime('')
    setScoreReleaseMode('auto')
    setScoreReleaseTime('')
    setAnswerReleaseTime('')
    setPublishRetry('0')
    setAllowLateSubmit(false)
    setAntiCheatLevel('record')
    setMaxViolations('3')
    setShowPublish(true)
  }

  const toEpoch = (value: string) => {
    if (!value) return undefined
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : undefined
  }

  const togglePublishClass = (classId: string) => {
    setPublishClassIds((prev) => prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId])
  }

  const handlePublish = async () => {
    if (!publishTitle.trim() || !publishDuration) {
      alert('请填写发布标题和考试时长')
      return
    }
    if (publishClassIds.length === 0) {
      alert('请选择至少一个发布班级')
      return
    }
    const fixedScoreReleaseTime = scoreReleaseMode === 'fixed' ? toEpoch(scoreReleaseTime) : null
    if (scoreReleaseMode === 'fixed' && !fixedScoreReleaseTime) {
      alert('请选择成绩公布时间')
      return
    }
    const token = useAuthStore.getState().token
    const latestQuality = await refreshQuality()
    if (latestQuality && !latestQuality.canPublish) {
      alert('试卷质量检查未通过，请先修复错误项')
      return
    }
    const res = await fetch(`${API}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        examId: exam.id,
        title: publishTitle.trim(),
        duration: Number(publishDuration),
        classIds: publishClassIds,
        shuffle: shuffleQuestions,
        startTime: toEpoch(publishStartTime),
        endTime: toEpoch(publishEndTime),
        scoreReleaseTime: fixedScoreReleaseTime,
        answerReleaseTime: toEpoch(answerReleaseTime),
        retry: Math.max(0, Number(publishRetry) || 0),
        allowLateSubmit,
        antiCheatLevel,
        maxViolations: Math.max(1, Number(maxViolations) || 3),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || '发布失败')
      return
    }
    const data = await res.json()
    const createdPublishes = Array.isArray(data.publishes) ? data.publishes : data.publish ? [data.publish] : []
    if (createdPublishes.length > 0) {
      setPublishes((prev) => [...createdPublishes, ...prev.filter((item) => !createdPublishes.some((created: any) => created.id === item.id))])
    }
    await updateExamSafely({ status: 'published' } as any)
    setShowPublish(false)
    setPublishClassIds([])
  }

  const sortedQuestions = [...exam.questions].sort((a, b) => a.order - b.order)

  const DIFF_LABELS: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' }
  const DIFF_COLORS: Record<string, string> = { easy: 'text-green-600', medium: 'text-yellow-600', hard: 'text-red-600' }
  const TYPE_LABELS: Record<string, string> = { choice: '选择题', truefalse: '判断题', fillblank: '填空题', essay: '问答题', match: '匹配题', ordering: '排序题' }

  return (
    <div className="max-w-3xl mx-auto">
      {/* 标题区 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/exams')} className="text-gray-400 hover:text-gray-600 text-sm">&larr; 返回</button>
        {editTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 px-3 py-1.5 text-lg font-bold border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setEditTitle(false); setTitle(exam.title) } }}
            />
            <button onClick={handleTitleSave} className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg">保存</button>
          </div>
        ) : (
          <h1 className="text-2xl font-bold flex-1" onDoubleClick={() => { if (!lockedByPublish) { setEditTitle(true); setTitle(exam.title) } }}>{exam.title}</h1>
        )}
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => setPreviewMode('student')} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            学生卷预览
          </button>
          <button onClick={() => setPreviewMode('answer')} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            答案卷
          </button>
          <button onClick={refreshQuality} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            {qualityLoading ? '检查中...' : '质量检查'}
          </button>
          {lockedByPublish && (
            <button onClick={handleCreateVersion} className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
              复制为新版本
            </button>
          )}
          {exam.status === 'draft' ? (
            <button onClick={openPublishModal} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600">
              发布
            </button>
          ) : (
            <button onClick={() => updateExamSafely({ status: 'draft' } as any)} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
              取消发布
            </button>
          )}
          <button onClick={handlePrint} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            打印
          </button>
        </div>
      </div>

      {/* 试卷信息 */}
      <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
        <span>{sortedQuestions.length} 道题</span>
        <span>总分: {exam.totalScore} 分</span>
        <span>创建于 {new Date(exam.createdAt).toLocaleDateString('zh-CN')}</span>
        <span>v{exam.versionNumber || 1}</span>
        {lockedByPublish && <span className="text-amber-600">已锁定内容</span>}
      </div>

      {lockedByPublish && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          这份试卷已有发布记录，题目、分值和标题已锁定。需要调整内容时，请复制为新版本后编辑。
        </div>
      )}

      {qualityReport && (
        <div className={'mb-6 rounded-xl border p-4 ' + (qualityReport.canPublish ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800">出卷质量检查</h2>
            <span className={'text-xs px-2 py-0.5 rounded-full ' + (qualityReport.canPublish ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{qualityStatus}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600 mb-3">
            <span>错误 {qualityReport.summary?.errorCount || 0}</span>
            <span>提醒 {qualityReport.summary?.warningCount || 0}</span>
            <span>题量 {qualityReport.summary?.questionCount || 0}</span>
            <span>分值 {qualityReport.summary?.totalScore || 0}</span>
          </div>
          {qualityReport.issues?.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {qualityReport.issues.slice(0, 6).map((issue: any, index: number) => (
                <li key={index} className={issue.level === 'error' ? 'text-red-700' : 'text-amber-700'}>{issue.level === 'error' ? '错误：' : '提醒：'}{issue.message}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-green-700">题干、答案、分值和重复检查通过。</p>
          )}
          {qualityReport.blueprint?.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-gray-500"><tr><th className="py-1">知识点</th><th>题量</th><th>分值</th><th>题型</th><th>难度</th></tr></thead>
                <tbody>
                  {qualityReport.blueprint.map((row: any) => (
                    <tr key={row.knowledgePoint} className="border-t border-white/70">
                      <td className="py-1 pr-2">{row.knowledgePoint}</td>
                      <td>{row.questionCount}</td>
                      <td>{row.score}</td>
                      <td>{Object.entries(row.types || {}).map(([k, v]) => k + ':' + v).join(' / ')}</td>
                      <td>{Object.entries(row.difficulties || {}).map(([k, v]) => k + ':' + v).join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {versions.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800">版本记录</h2>
            <span className="text-xs text-gray-400">{versions.length} 个版本</span>
          </div>
          <div className="space-y-2">
            {versions.map((item) => (
              <button key={item.id} onClick={() => navigate('/exams/' + item.id)} className={'w-full text-left flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ' + (item.id === exam.id ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 hover:bg-gray-50')}>
                <span className="truncate">v{item.versionNumber || 1} · {item.title}</span>
                <span className="shrink-0 text-xs text-gray-400">{item.status === 'published' ? '已发布' : '草稿'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <PublishManagementPanel
        publishes={publishes}
        title="发布管理"
        emptyMessage="这份试卷还没有发布记录。发布后这里会显示班级、可见学生、已开始、已提交和成绩公布设置。"
        onRefresh={refreshPublishes}
        onPublishUpdated={(publish) => setPublishes((prev) => prev.map((item) => item.id === publish.id ? publish : item))}
      />
      {/* 题目列表 */}
      <div className="space-y-4">
        {sortedQuestions.map((eq: ExamQuestion, i: number) => {
          const q = questionMap.get(eq.questionId)
          if (!q) return null
          return (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-indigo-600">{i + 1}.</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{TYPE_LABELS[q.type]}</span>
                  <span className={`text-xs ${DIFF_COLORS[q.difficulty]}`}>{DIFF_LABELS[q.difficulty]}</span>
                  <span className="text-xs text-gray-400">({eq.score}分)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={lockedByPublish} onClick={() => handleMoveUp(q.id)} className="text-xs text-gray-400 hover:text-gray-600 px-1 disabled:opacity-30" title="上移">↑</button>
                  <button disabled={lockedByPublish} onClick={() => handleMoveDown(q.id)} className="text-xs text-gray-400 hover:text-gray-600 px-1 disabled:opacity-30" title="下移">↓</button>
                  <button disabled={lockedByPublish} onClick={() => setEditingQId(q.id)} className="text-xs text-indigo-400 hover:text-indigo-600 px-1 disabled:opacity-30" title="编辑题目">✎</button>
                  <button disabled={lockedByPublish} onClick={() => saveQuestions(exam.questions.filter((item) => item.questionId !== q.id).map((item, idx) => ({ ...item, order: idx + 1 })))} className="text-xs text-red-400 hover:text-red-600 px-1 disabled:opacity-30" title="从试卷移除">×</button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-800 mb-1">{q.title}</h3>
              <LatexRenderer content={q.content} className="text-gray-600 text-sm" />

              {/* 选择题选项 */}
              {q.type === 'choice' && q.options && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {q.options.map((opt) => (
                    <div key={opt.id} className={`text-sm px-3 py-1.5 rounded-lg border ${
                      q.answer.type === 'choice' && q.answer.selectedOptionId === opt.id
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}>
                      <div className="flex items-start gap-1.5">
                        <span className="font-medium text-gray-500 shrink-0">{opt.label}.</span>
                        <LatexRenderer content={opt.content} className="min-w-0 flex-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 分值修改 */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-400">分值:</span>
                <input
                  type="number"
                  value={eq.score}
                  onChange={(e) => handleScoreChange(q.id, Math.max(0, Number(e.target.value)))}
                  disabled={lockedByPublish}
                  className="w-16 text-xs px-2 py-0.5 border border-gray-200 rounded outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  min={0}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* 编辑题目弹窗 */}
      <Modal open={editingQId !== null} onClose={() => setEditingQId(null)} title="编辑题目" width="max-w-2xl">
        {editingQId && (
          <QuestionForm
            question={questionMap.get(editingQId) ?? null}
            onSaved={() => setEditingQId(null)}
            onCancel={() => setEditingQId(null)}
          />
        )}
      </Modal>

      <Modal open={previewMode !== null} onClose={() => setPreviewMode(null)} title={previewMode === 'answer' ? '教师答案卷' : '学生卷预览'} width="max-w-4xl">
        <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <button onClick={() => setPreviewMode('student')} className={(previewMode === 'student' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'text-gray-500 border-gray-200') + ' px-3 py-1.5 text-sm border rounded-lg'}>学生卷</button>
            <button onClick={() => setPreviewMode('answer')} className={(previewMode === 'answer' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'text-gray-500 border-gray-200') + ' px-3 py-1.5 text-sm border rounded-lg'}>答案卷</button>
          </div>
          <div>
            <h2 className="text-xl font-bold text-center">{exam.title}</h2>
            <p className="text-center text-sm text-gray-400 mt-1">共 {sortedQuestions.length} 题 · {exam.totalScore} 分</p>
          </div>
          {sortedQuestions.map((eq, index) => {
            const q = questionMap.get(eq.questionId)
            if (!q) return null
            return (
              <div key={eq.questionId} className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-gray-900">第 {index + 1} 题</span>
                  <span className="text-sm text-gray-400">({eq.score} 分)</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{TYPE_LABELS[q.type]}</span>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{q.title}</h3>
                <LatexRenderer content={q.content} className="text-sm text-gray-700" />
                {q.type === 'choice' && q.options && (
                  <div className="mt-3 space-y-2">
                    {q.options.map((opt) => (
                      <div key={opt.id} className="flex items-start gap-2 text-sm">
                        <span className="font-medium text-gray-500">{opt.label}.</span>
                        <LatexRenderer content={opt.content} className="min-w-0 flex-1" />
                      </div>
                    ))}
                  </div>
                )}
                {previewMode === 'answer' && (
                  <div className="mt-3 rounded-lg bg-green-50 border border-green-100 p-3 text-sm text-green-900 space-y-2">
                    <p><span className="font-medium">参考答案：</span>{answerText(q)}</p>
                    {q.explanation && <p><span className="font-medium">解析：</span>{q.explanation}</p>}
                    {q.knowledgePoints.length > 0 && <p><span className="font-medium">知识点：</span>{q.knowledgePoints.join('、')}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Modal>
      {/* 发布弹窗 */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-5 max-h-[88vh] overflow-y-auto">
            <h3 className="font-semibold text-lg">发布试卷</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">发布标题</span>
                <input value={publishTitle} onChange={(e) => setPublishTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">考试时长（分钟）</span>
                <input type="number" value={publishDuration} onChange={(e) => setPublishDuration(e.target.value)} min={1} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
            </div>

            <div className="block text-sm text-gray-600">
              <div className="flex items-center justify-between mb-1">
                <span>发布班级</span>
                <span className="text-xs text-gray-400">已选 {publishClassIds.length}</span>
              </div>
              <div className="border rounded-lg p-2 space-y-1 max-h-36 overflow-y-auto bg-white">
                {classesLoading ? (
                  <p className="text-xs text-gray-400 px-2 py-1">班级加载中...</p>
                ) : classes.length === 0 ? (
                  <p className="text-xs text-red-500 px-2 py-1">请先创建班级，再发布试卷</p>
                ) : classes.map((cls) => (
                  <label key={cls.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publishClassIds.includes(cls.id)}
                      onChange={() => togglePublishClass(cls.id)}
                      className="w-4 h-4 accent-indigo-500"
                    />
                    <span className="flex-1 text-gray-700">{cls.name}</span>
                    <span className="text-xs text-gray-400">{cls.studentCount || 0} 人</span>
                  </label>
                ))}
              </div>
            </div>
            {classesError && <p className="text-xs text-red-500">{classesError}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">开始时间</span>
                <input type="datetime-local" value={publishStartTime} onChange={(e) => setPublishStartTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">截止时间</span>
                <input type="datetime-local" value={publishEndTime} onChange={(e) => setPublishEndTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
              <div className="md:col-span-2 block text-sm text-gray-600">
                <span className="block mb-1">成绩公布方式</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={
                    'flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer ' +
                    (scoreReleaseMode === 'auto' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600')
                  }>
                    <input
                      type="radio"
                      name="scoreReleaseMode"
                      checked={scoreReleaseMode === 'auto'}
                      onChange={() => { setScoreReleaseMode('auto'); setScoreReleaseTime('') }}
                      className="accent-indigo-500"
                    />
                    <span>学生交卷后自动公布</span>
                  </label>
                  <label className={
                    'flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer ' +
                    (scoreReleaseMode === 'fixed' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600')
                  }>
                    <input
                      type="radio"
                      name="scoreReleaseMode"
                      checked={scoreReleaseMode === 'fixed'}
                      onChange={() => setScoreReleaseMode('fixed')}
                      className="accent-indigo-500"
                    />
                    <span>固定时间公布</span>
                  </label>
                </div>
                {scoreReleaseMode === 'fixed' && (
                  <input
                    type="datetime-local"
                    value={scoreReleaseTime}
                    onChange={(e) => setScoreReleaseTime(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border rounded-lg text-sm"
                  />
                )}
              </div>
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">答案公布时间</span>
                <input type="datetime-local" value={answerReleaseTime} onChange={(e) => setAnswerReleaseTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">允许重考次数</span>
                <input type="number" value={publishRetry} onChange={(e) => setPublishRetry(e.target.value)} min={0} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">防切屏策略</span>
                <select value={antiCheatLevel} onChange={(e) => setAntiCheatLevel(e.target.value as 'off' | 'record' | 'strict')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="record">记录异常</option>
                  <option value="strict">达到上限自动交卷</option>
                  <option value="off">关闭</option>
                </select>
              </label>
              <label className="block text-sm text-gray-600">
                <span className="block mb-1">违规上限</span>
                <input type="number" value={maxViolations} onChange={(e) => setMaxViolations(e.target.value)} min={1} disabled={antiCheatLevel === 'off'} className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400" />
              </label>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> 打乱题目顺序
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allowLateSubmit} onChange={(e) => setAllowLateSubmit(e.target.checked)} /> 允许截止后迟交
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowPublish(false)} className="px-4 py-1.5 border rounded-lg text-sm">取消</button>
              <button onClick={handlePublish} className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm">确认发布</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
