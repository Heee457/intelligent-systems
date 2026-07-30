import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuestionStore } from '../../store/questionStore'
import { useExamStore } from '../../store/examStore'
import type { QuestionType, Difficulty } from '../../types'

export default function ManualSelector() {
  const navigate = useNavigate()
  const { questions, getFilteredQuestions } = useQuestionStore()
  const { createExam, addQuestionToExam } = useExamStore()

  const [title, setTitle] = useState('')
  const [filterType, setFilterType] = useState<QuestionType | ''>('')
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | ''>('')
  const [filterKeyword, setFilterKeyword] = useState('')

  // 正在组装的试卷
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})

  const filtered = useMemo(
    () => getFilteredQuestions({ type: filterType || undefined, difficulty: filterDifficulty || undefined, keyword: filterKeyword || undefined }),
    [questions, filterType, filterDifficulty, filterKeyword, getFilteredQuestions],
  )

  const totalScore = selectedQuestionIds.reduce((sum, id) => sum + (scores[id] ?? 10), 0)
  const availableQuestions = filtered.filter((q) => !selectedQuestionIds.includes(q.id))

  const handleAdd = (id: string) => {
    setSelectedQuestionIds([...selectedQuestionIds, id])
    setScores({ ...scores, [id]: 10 })
  }

  const handleRemove = (id: string) => {
    setSelectedQuestionIds(selectedQuestionIds.filter((x) => x !== id))
    const next = { ...scores }
    delete next[id]
    setScores(next)
  }

  const handleMoveUp = (id: string) => {
    const idx = selectedQuestionIds.indexOf(id)
    if (idx <= 0) return
    const next = [...selectedQuestionIds]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSelectedQuestionIds(next)
  }

  const handleMoveDown = (id: string) => {
    const idx = selectedQuestionIds.indexOf(id)
    if (idx < 0 || idx >= selectedQuestionIds.length - 1) return
    const next = [...selectedQuestionIds]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSelectedQuestionIds(next)
  }

  const handleSave = () => {
    if (!title.trim() || selectedQuestionIds.length === 0) return
    const exam = createExam(title)
    selectedQuestionIds.forEach((qid) => {
      addQuestionToExam(exam.id, qid, scores[qid] ?? 10)
    })
    navigate(`/exams/${exam.id}`)
  }

  const TYPE_LABELS: Record<string, string> = { choice: '选择', truefalse: '判断', fillblank: '填空', essay: '问答', match: '匹配', ordering: '排序' }

  return (
    <div className="flex gap-6">
      {/* 左：题库 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold mb-3">可用题目</h3>
        <div className="flex gap-2 mb-3">
          <input value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)} placeholder="搜索..." className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as QuestionType | '')} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
            <option value="">全部题型</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value as Difficulty | '')} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
            <option value="">全部难度</option>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </div>
        <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto border rounded-lg">
          {availableQuestions.map((q) => (
            <div key={q.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{q.title}</p>
                <div className="flex gap-1">
                  <span className="text-xs text-gray-400">{TYPE_LABELS[q.type]}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">{{easy:'简单',medium:'中等',hard:'困难'}[q.difficulty]}</span>
                </div>
              </div>
              <button onClick={() => handleAdd(q.id)} className="shrink-0 text-xs px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
                + 添加
              </button>
            </div>
          ))}
          {availableQuestions.length === 0 && <p className="text-center text-gray-400 text-sm py-8">没有可用的题目</p>}
        </div>
      </div>

      {/* 右：试卷预览 */}
      <div className="w-96 bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold mb-3">试卷预览</h3>
        <div className="mb-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="试卷标题..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto border rounded-lg mb-4">
          {selectedQuestionIds.map((id, idx) => {
            const q = questions.find((x) => x.id === id)
            if (!q) return null
            return (
              <div key={id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">{idx + 1}.</span>
                  <span className="text-sm flex-1 truncate">{q.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={scores[id] ?? 10}
                    onChange={(e) => setScores({ ...scores, [id]: Math.max(0, Number(e.target.value)) })}
                    className="w-16 text-xs px-2 py-0.5 border border-gray-200 rounded outline-none"
                    min={0}
                  />
                  <span className="text-xs text-gray-400">分</span>
                  <div className="flex-1" />
                  <button onClick={() => handleMoveUp(id)} className="text-xs text-gray-400 hover:text-gray-600" title="上移">↑</button>
                  <button onClick={() => handleMoveDown(id)} className="text-xs text-gray-400 hover:text-gray-600" title="下移">↓</button>
                  <button onClick={() => handleRemove(id)} className="text-xs text-red-400 hover:text-red-600">×</button>
                </div>
              </div>
            )
          })}
          {selectedQuestionIds.length === 0 && <p className="text-center text-gray-400 text-sm py-8">从左侧添加题目</p>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">总分: {totalScore}</span>
          <button
            onClick={handleSave}
            disabled={!title.trim() || selectedQuestionIds.length === 0}
            className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存试卷
          </button>
        </div>
      </div>
    </div>
  )
}
