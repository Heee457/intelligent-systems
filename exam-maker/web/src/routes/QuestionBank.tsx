import { useState, useMemo } from 'react'
import { useQuestionStore } from '../store/questionStore'
import type { QuestionType, Difficulty } from '../types'
import QuestionList from '../components/questions/QuestionList'
import QuestionForm from '../components/questions/QuestionForm'
import Modal from '../components/shared/Modal'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import EmptyState from '../components/shared/EmptyState'

export default function QuestionBank() {
  const {
    questions, deleteQuestion, deleteQuestions,
    exportQuestions, importQuestions, batchSetDifficulty,
  } = useQuestionStore()

  // 筛选状态
  const [filterType, setFilterType] = useState<QuestionType | ''>('')
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | ''>('')
  const [filterKeyword, setFilterKeyword] = useState('')
  const [filterKnowledgePoint, setFilterKnowledgePoint] = useState('')

  // 选择状态
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 弹窗状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 计算过滤后的题目（客户端过滤；服务端过滤可通过 fetchQuestions(filter) 实现）
  const filteredQuestions = useMemo(() => {
    let result = questions
    if (filterType) result = result.filter((q) => q.type === filterType)
    if (filterDifficulty) result = result.filter((q) => q.difficulty === filterDifficulty)
    if (filterKnowledgePoint)
      result = result.filter((q) => q.knowledgePoints.some((kp) => kp.includes(filterKnowledgePoint)))
    if (filterKeyword) {
      const kw = filterKeyword.toLowerCase()
      result = result.filter(
        (q) => q.title.toLowerCase().includes(kw) || q.content.toLowerCase().includes(kw),
      )
    }
    return result
  }, [questions, filterType, filterDifficulty, filterKeyword, filterKnowledgePoint])

  const selectedQuestion = editingQuestion
    ? questions.find((q) => q.id === editingQuestion) ?? null
    : null

  // 所有知识点（从题库中提取）
  const allKnowledgePoints = useMemo(
    () => [...new Set(questions.flatMap((q) => q.knowledgePoints))].sort(),
    [questions],
  )

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        const count = await importQuestions(reader.result as string)
        alert(`成功导入 ${count} 道题目`)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleExport = async () => {
    const json = await exportQuestions()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `exam-maker-questions-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-6">
      {/* 左侧：列表区 */}
      <div className="w-96 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 搜索与筛选 */}
        <div className="p-3 space-y-2 border-b border-gray-100">
          <input
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
            placeholder="🔍 搜索题目..."
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
          <div className="flex gap-2">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as QuestionType | '')} className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="">全部题型</option>
              <option value="choice">选择题</option>
              <option value="truefalse">判断题</option>
              <option value="fillblank">填空题</option>
              <option value="essay">问答题</option>
              <option value="match">匹配题</option>
              <option value="ordering">排序题</option>
            </select>
            <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value as Difficulty | '')} className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="">全部难度</option>
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
            </select>
          </div>
          {allKnowledgePoints.length > 0 && (
            <select value={filterKnowledgePoint} onChange={(e) => setFilterKnowledgePoint(e.target.value)} className="w-full text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="">全部知识点</option>
              {allKnowledgePoints.map((kp) => (
                <option key={kp} value={kp}>{kp}</option>
              ))}
            </select>
          )}
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
          <button onClick={() => { setEditingQuestion(null); setFormOpen(true) }} className="text-xs px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium">
            + 新建
          </button>
          {selectedIds.length > 0 && (
            <>
              <button
                onClick={() => { deleteQuestions(selectedIds); setSelectedIds([]); setSelectedId(null) }}
                className="text-xs px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                删除选中 ({selectedIds.length})
              </button>
              <select
                onChange={(e) => {
                  if (e.target.value) batchSetDifficulty(selectedIds, e.target.value as Difficulty)
                  e.target.value = ''
                }}
                className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
              >
                <option value="">批量改难度</option>
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </>
          )}
          <div className="flex-1" />
          <button onClick={handleImport} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">导入</button>
          <button onClick={handleExport} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">导出</button>
        </div>

        {/* 题目列表 */}
        {filteredQuestions.length === 0 ? (
          <EmptyState
            icon="📝"
            title={questions.length === 0 ? '还没有题目' : '没有匹配的题目'}
            description={questions.length === 0 ? '点击"新建"创建第一道题目' : '尝试调整筛选条件'}
            action={questions.length === 0 ? (
              <button onClick={() => { setEditingQuestion(null); setFormOpen(true) }} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">
                创建题目
              </button>
            ) : undefined}
          />
        ) : (
          <QuestionList
            questions={filteredQuestions}
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setEditingQuestion(null) }}
            selectedIds={selectedIds}
            onToggleSelect={(id) => {
              setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
            }}
            onSelectAll={() => setSelectedIds(filteredQuestions.map((q) => q.id))}
            onClearSelection={() => setSelectedIds([])}
          />
        )}
      </div>

      {/* 右侧：编辑区 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
        {selectedId && !formOpen ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">题目详情</h2>
              <div className="flex gap-2">
                <button onClick={() => { setEditingQuestion(selectedId); setFormOpen(true) }} className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
                  编辑
                </button>
                <button onClick={() => setDeleteConfirm(selectedId)} className="px-4 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  删除
                </button>
              </div>
            </div>
            <QuestionDetail question={questions.find((q) => q.id === selectedId)!} />
          </div>
        ) : (
          <EmptyState icon="👈" title="选择左侧题目查看详情" description={'或点击"新建"创建题目'} />
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditingQuestion(null) }} title={editingQuestion ? '编辑题目' : '创建题目'} width="max-w-2xl">
        <QuestionForm
          question={selectedQuestion}
          onSaved={() => { setFormOpen(false); setEditingQuestion(null); setSelectedId(selectedQuestion?.id ?? null) }}
          onCancel={() => { setFormOpen(false); setEditingQuestion(null) }}
        />
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) deleteQuestion(deleteConfirm); setDeleteConfirm(null); setSelectedId(null) }}
        title="删除题目"
        message="确定要删除这道题目吗？此操作不可撤销。"
        confirmLabel="删除"
        danger
      />
    </div>
  )
}

// 题目详情展示
function QuestionDetail({ question }: { question: import('../types').Question }) {
  if (!question) return null
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded ${
          { choice:'bg-blue-50 text-blue-700', truefalse:'bg-cyan-50 text-cyan-700', fillblank:'bg-amber-50 text-amber-700', essay:'bg-purple-50 text-purple-700', match:'bg-pink-50 text-pink-700', ordering:'bg-teal-50 text-teal-700' }[question.type]
        }`}>
          {{choice:'选择题',truefalse:'判断题',fillblank:'填空题',essay:'问答题',match:'匹配题',ordering:'排序题'}[question.type]}
        </span>
        <span className={`text-xs ${question.difficulty === 'easy' ? 'text-green-600' : question.difficulty === 'medium' ? 'text-yellow-600' : 'text-red-600'}`}>
          {{easy:'简单',medium:'中等',hard:'困难'}[question.difficulty]}
        </span>
      </div>
      <h3 className="text-lg font-semibold">{question.title}</h3>
      <p className="text-gray-700 whitespace-pre-wrap">{question.content}</p>

      {question.type === 'choice' && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <div key={opt.id} className={`px-4 py-2 rounded-lg border ${
              question.answer.type === 'choice' && question.answer.selectedOptionId === opt.id
                ? 'border-green-300 bg-green-50'
                : 'border-gray-200'
            }`}>
              <span className="font-medium text-gray-500 mr-2">{opt.label}.</span>
              {opt.content}
              {question.answer.type === 'choice' && question.answer.selectedOptionId === opt.id && (
                <span className="ml-2 text-green-600 text-sm">✓ 正确答案</span>
              )}
            </div>
          ))}
        </div>
      )}

      {question.knowledgePoints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {question.knowledgePoints.map((kp) => (
            <span key={kp} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{kp}</span>
          ))}
        </div>
      )}
    </div>
  )
}
