import type { Question, QuestionType, Difficulty } from '../../types'

interface QuestionListProps {
  questions: Question[]
  selectedId: string | null
  onSelect: (id: string) => void
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
}

const TYPE_BADGES: Record<QuestionType, string> = {
  choice: 'bg-blue-50 text-blue-700',
  truefalse: 'bg-cyan-50 text-cyan-700',
  fillblank: 'bg-amber-50 text-amber-700',
  essay: 'bg-purple-50 text-purple-700',
  match: 'bg-pink-50 text-pink-700',
  ordering: 'bg-teal-50 text-teal-700',
}

const TYPE_LABELS: Record<QuestionType, string> = {
  choice: '选择', truefalse: '判断', fillblank: '填空',
  essay: '问答', match: '匹配', ordering: '排序',
}

const DIFF_LABELS: Record<Difficulty, string> = { easy: '简单', medium: '中等', hard: '困难' }
const DIFF_COLORS: Record<Difficulty, string> = {
  easy: 'text-green-600', medium: 'text-yellow-600', hard: 'text-red-600',
}

export default function QuestionList({
  questions, selectedId, onSelect, selectedIds, onToggleSelect, onSelectAll, onClearSelection,
}: QuestionListProps) {
  return (
    <div>
      {questions.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
          <input
            type="checkbox"
            checked={selectedIds.length === questions.length && questions.length > 0}
            onChange={() => selectedIds.length === questions.length ? onClearSelection() : onSelectAll()}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="text-xs text-gray-500">
            {selectedIds.length > 0 ? `已选 ${selectedIds.length}/${questions.length}` : `${questions.length} 道题`}
          </span>
        </div>
      )}
      <div className="divide-y divide-gray-50 max-h-[calc(100vh-240px)] overflow-y-auto">
        {questions.map((q) => (
          <div
            key={q.id}
            onClick={() => onSelect(q.id)}
            className={`px-3 py-3 cursor-pointer transition-colors hover:bg-gray-50 flex items-start gap-2 ${
              selectedId === q.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(q.id)}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(q.id) }}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 mt-0.5 accent-indigo-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_BADGES[q.type]}`}>
                  {TYPE_LABELS[q.type]}
                </span>
                <span className={`text-xs ${DIFF_COLORS[q.difficulty]}`}>
                  {DIFF_LABELS[q.difficulty]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{q.title}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{q.content}</p>
              {q.knowledgePoints.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {q.knowledgePoints.slice(0, 3).map((kp) => (
                    <span key={kp} className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{kp}</span>
                  ))}
                  {q.knowledgePoints.length > 3 && (
                    <span className="text-xs text-gray-400">+{q.knowledgePoints.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
