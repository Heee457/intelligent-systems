import { useExamStore } from '../store/examStore'
import EmptyState from '../components/shared/EmptyState'

export default function History() {
  const { history, clearHistory } = useExamStore()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">组卷历史</h1>
        {history.length > 0 && (
          <button onClick={clearHistory} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
            清除历史
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState icon="📋" title="暂无组卷记录" description="当你使用自动或智能组卷功能时，记录会出现在这里" />
      ) : (
        <div className="space-y-3">
          {[...history].reverse().map((entry) => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{entry.examTitle}</h3>
                <span className="text-xs text-gray-400">
                  {new Date(entry.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.rule.sections.map((sec, i) => (
                  <span key={i} className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded border border-gray-100">
                    {sec.type} × {sec.count}道 ({sec.scorePerQuestion}分/题)
                    {sec.difficulty ? ` · ${sec.difficulty}` : ''}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2">总分: {entry.rule.totalScore}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
