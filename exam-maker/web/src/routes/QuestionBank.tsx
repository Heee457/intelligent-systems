import { useState, useMemo, useEffect } from 'react'
import { useQuestionStore, type QualityQuestion, type QualityReport } from '../store/questionStore'
import type { Question, QuestionType, Difficulty } from '../types'
import QuestionList from '../components/questions/QuestionList'
import QuestionForm from '../components/questions/QuestionForm'
import Modal from '../components/shared/Modal'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import EmptyState from '../components/shared/EmptyState'
import LatexRenderer from '../components/shared/LatexRenderer'

export default function QuestionBank() {
  const {
    questions, deleteQuestion, deleteQuestions,
    exportQuestions, importQuestions, batchSetDifficulty, fetchQuestions,
    qualityReport, qualityLoading, fetchQualityReport, recomputeQualityReport,
  } = useQuestionStore()

  // 挂载时从 API 加载题库和治理报告
  useEffect(() => { fetchQuestions(); fetchQualityReport() }, [fetchQuestions, fetchQualityReport])

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
        await fetchQualityReport()
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

  const handleQualityScan = async () => {
    await recomputeQualityReport()
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

      {/* 右侧：治理和详情区 */}
      <div className="flex-1 space-y-4">
        <QualityGovernancePanel
          report={qualityReport}
          loading={qualityLoading}
          onRecompute={handleQualityScan}
          onSelectQuestion={(id) => { setSelectedId(id); setEditingQuestion(null) }}
        />
        <div className="bg-white rounded-xl border border-gray-200 p-6">
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

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: '简单', medium: '中等', hard: '困难' }

const QUALITY_STATS = [
  ['total', '总题数'],
  ['issueCount', '需完善'],
  ['duplicateGroupCount', '重复组'],
  ['difficultySuggestionCount', '难度建议'],
  ['errorProneCount', '易错题'],
] as const

function QualityGovernancePanel({
  report, loading, onRecompute, onSelectQuestion,
}: {
  report: QualityReport | null
  loading: boolean
  onRecompute: () => void
  onSelectQuestion: (id: string) => void
}) {
  const hasReport = Boolean(report)
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">题库治理</h2>
          {report?.checkedAt && <p className="text-xs text-gray-400 mt-0.5">最近扫描 {new Date(report.checkedAt).toLocaleString()}</p>}
        </div>
        <button
          onClick={onRecompute}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60"
        >
          {loading ? '扫描中...' : '治理扫描'}
        </button>
      </div>

      {hasReport ? (
        <>
          <div className="grid grid-cols-5 divide-x divide-gray-100 border-y border-gray-100 py-3 text-center">
            {QUALITY_STATS.map(([key, label]) => (
              <div key={key}>
                <div className="text-lg font-semibold text-gray-900">{report!.summary[key]}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4">
            <QualityList
              title="需完善"
              items={report!.issueQuestions}
              empty="无明显缺项"
              onSelectQuestion={onSelectQuestion}
              renderMeta={(item) => item.qualityIssues.join('、')}
            />
            <DuplicateList report={report!} onSelectQuestion={onSelectQuestion} />
            <QualityList
              title="难度建议"
              items={report!.difficultySuggestions}
              empty="暂无建议"
              onSelectQuestion={onSelectQuestion}
              renderMeta={(item) => '建议 ' + (item.difficultySuggestion ? DIFFICULTY_LABELS[item.difficultySuggestion] : '-') + '，得分率 ' + (item.scoreRate ?? '-') + '%'}
            />
            <QualityList
              title="易错回流"
              items={report!.errorProneQuestions}
              empty="暂无易错题"
              onSelectQuestion={onSelectQuestion}
              renderMeta={(item) => '得分率 ' + (item.scoreRate ?? '-') + '%，' + item.attempts + ' 次作答'}
            />
          </div>
        </>
      ) : (
        <div className="border-t border-gray-100 pt-3 text-sm text-gray-500">暂无扫描报告</div>
      )}
    </div>
  )
}

function QualityList({
  title, items, empty, onSelectQuestion, renderMeta,
}: {
  title: string
  items: QualityQuestion[]
  empty: string
  onSelectQuestion: (id: string) => void
  renderMeta: (item: QualityQuestion) => string
}) {
  const visible = items.slice(0, 3)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {items.length > 3 && <span className="text-xs text-gray-400">+{items.length - 3}</span>}
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-gray-400">{empty}</p>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <button key={item.id} onClick={() => onSelectQuestion(item.id)} className="block w-full text-left group">
              <span className="block text-sm text-gray-700 truncate group-hover:text-indigo-600">{item.title}</span>
              <span className="block text-xs text-gray-400 truncate">{renderMeta(item)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DuplicateList({ report, onSelectQuestion }: { report: QualityReport; onSelectQuestion: (id: string) => void }) {
  const visible = report.duplicateGroups.slice(0, 3)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">重复/相似</h3>
        {report.duplicateGroups.length > 3 && <span className="text-xs text-gray-400">+{report.duplicateGroups.length - 3}</span>}
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-gray-400">未发现重复组</p>
      ) : (
        <div className="space-y-2">
          {visible.map((group) => (
            <div key={group.id}>
              <p className="text-xs text-gray-400">{group.reason}</p>
              <div className="space-y-1 mt-1">
                {group.questions.slice(0, 2).map((item) => (
                  <button key={item.id} onClick={() => onSelectQuestion(item.id)} className="block w-full text-left text-sm text-gray-700 truncate hover:text-indigo-600">
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatAnswer(question: Question): string {
  const answer = question.answer
  switch (answer.type) {
    case 'choice': {
      const option = question.options?.find((item) => item.id === answer.selectedOptionId)
      return option ? option.label + '. ' + option.content : answer.selectedOptionId
    }
    case 'truefalse':
      return answer.value ? '正确' : '错误'
    case 'fillblank':
      return answer.blanks.join('\\n')
    case 'essay':
      return answer.referenceAnswer
    case 'match':
      return answer.pairs.map((pair) => pair.left + ' → ' + pair.right).join('\\n')
    case 'ordering':
      return answer.orderedItems.join(' → ')
    default:
      return ''
  }
}

// 题目详情展示
function QuestionDetail({ question }: { question: Question }) {
  if (!question) return null
  const referenceAnswer = formatAnswer(question)
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
        {question.qualityIssues?.length ? <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700">需完善</span> : null}
        {question.isErrorProne && <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">易错</span>}
        {question.isKeyQuestion && <span className="text-xs px-2 py-0.5 rounded bg-rose-50 text-rose-700">重点</span>}
        {question.difficultySuggestion && question.difficultySuggestion !== question.difficulty && (
          <span className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700">建议：{DIFFICULTY_LABELS[question.difficultySuggestion]}</span>
        )}
      </div>
      <h3 className="text-lg font-semibold">{question.title}</h3>
      <LatexRenderer content={question.content} className="text-gray-700" />

      {Boolean(question.qualityIssues?.length || question.difficultySuggestionReason) && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          {question.qualityIssues?.map((issue) => <p key={issue}>• {issue}</p>)}
          {question.difficultySuggestionReason && <p>• 难度校准：{question.difficultySuggestionReason}</p>}
        </div>
      )}

      {question.type === 'choice' && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <div key={opt.id} className={`px-4 py-2 rounded-lg border ${
              question.answer.type === 'choice' && question.answer.selectedOptionId === opt.id
                ? 'border-green-300 bg-green-50'
                : 'border-gray-200'
            }`}>
              <div className="flex items-start gap-2">
                <span className="font-medium text-gray-500 shrink-0">{opt.label}.</span>
                <LatexRenderer content={opt.content} className="min-w-0 flex-1 text-sm text-gray-700" />
                {question.answer.type === 'choice' && question.answer.selectedOptionId === opt.id && (
                  <span className="shrink-0 text-green-600 text-sm">✓ 正确答案</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {referenceAnswer && (
        <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
          <h4 className="text-sm font-semibold text-green-800 mb-2">参考答案</h4>
          <LatexRenderer content={referenceAnswer} className="text-sm text-green-900" />
        </div>
      )}

      {question.explanation && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">解析</h4>
          <LatexRenderer content={question.explanation} className="text-sm text-gray-700" />
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
