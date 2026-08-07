import { useParams, useNavigate } from 'react-router-dom'
import { useExamStore } from '../store/examStore'
import { useQuestionStore } from '../store/questionStore'
import { useAuthStore } from '../store/authStore'
import { useState } from 'react'
import Modal from '../components/shared/Modal'
import QuestionForm from '../components/questions/QuestionForm'
import type { ExamQuestion } from '../types'

const API = 'http://localhost:3001'

export default function ExamViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { exams, updateExam, removeQuestionFromExam } = useExamStore()
  const { questions } = useQuestionStore()

  const exam = exams.find((e) => e.id === id)

  const [editTitle, setEditTitle] = useState(false)
  const [title, setTitle] = useState(exam?.title ?? '')
  const [editingQId, setEditingQId] = useState<string | null>(null)

  // 发布弹窗状态
  const [showPublish, setShowPublish] = useState(false)
  const [publishTitle, setPublishTitle] = useState(exam?.title ?? '')
  const [publishDuration, setPublishDuration] = useState('')
  const [shuffleQuestions, setShuffleQuestions] = useState(false)

  if (!exam) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-lg">试卷不存在</p>
        <button onClick={() => navigate('/exams')} className="mt-4 text-indigo-500 hover:text-indigo-700 text-sm">返回试卷列表</button>
      </div>
    )
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]))

  const handleTitleSave = () => {
    if (title.trim()) {
      updateExam(exam.id, { title: title.trim() })
    }
    setEditTitle(false)
  }

  // 新 store 无 reorderExamQuestions/setQuestionScore，用 updateExam 组合实现
  const saveQuestions = (questions: ExamQuestion[]) => {
    updateExam(exam.id, { questions, totalScore: questions.reduce((sum, q) => sum + q.score, 0) })
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

  const handlePublish = async () => {
    if (!publishTitle.trim() || !publishDuration) {
      alert('请填写发布标题和考试时长')
      return
    }
    const token = useAuthStore.getState().token
    const res = await fetch(`${API}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        examId: exam.id,
        title: publishTitle.trim(),
        duration: Number(publishDuration),
        shuffle: shuffleQuestions,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || '发布失败')
      return
    }
    await updateExam(exam.id, { status: 'published' })
    setShowPublish(false)
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
          <h1 className="text-2xl font-bold flex-1" onDoubleClick={() => { setEditTitle(true); setTitle(exam.title) }}>{exam.title}</h1>
        )}
        <div className="flex gap-2">
          {exam.status === 'draft' ? (
            <button onClick={() => setShowPublish(true)} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600">
              发布
            </button>
          ) : (
            <button onClick={() => updateExam(exam.id, { status: 'draft' })} className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
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
      </div>

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
                  <button onClick={() => handleMoveUp(q.id)} className="text-xs text-gray-400 hover:text-gray-600 px-1" title="上移">↑</button>
                  <button onClick={() => handleMoveDown(q.id)} className="text-xs text-gray-400 hover:text-gray-600 px-1" title="下移">↓</button>
                  <button onClick={() => setEditingQId(q.id)} className="text-xs text-indigo-400 hover:text-indigo-600 px-1" title="编辑题目">✎</button>
                  <button onClick={() => removeQuestionFromExam(exam.id, q.id)} className="text-xs text-red-400 hover:text-red-600 px-1" title="从试卷移除">×</button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-800 mb-1">{q.title}</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">{q.content}</p>

              {/* 选择题选项 */}
              {q.type === 'choice' && q.options && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {q.options.map((opt) => (
                    <div key={opt.id} className={`text-sm px-3 py-1.5 rounded-lg border ${
                      q.answer.type === 'choice' && q.answer.selectedOptionId === opt.id
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}>
                      <span className="font-medium text-gray-500">{opt.label}.</span> {opt.content}
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
                  className="w-16 text-xs px-2 py-0.5 border border-gray-200 rounded outline-none"
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

      {/* 发布弹窗 */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold text-lg">发布试卷</h3>
            <input
              value={publishTitle}
              onChange={(e) => setPublishTitle(e.target.value)}
              placeholder="发布标题"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="number"
              value={publishDuration}
              onChange={(e) => setPublishDuration(e.target.value)}
              placeholder="考试时长（分钟）"
              min={1}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <div className="flex gap-2">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> 打乱题目顺序
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPublish(false)} className="px-4 py-1.5 border rounded-lg text-sm">取消</button>
              <button onClick={handlePublish} className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm">确认发布</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
