import { useState } from 'react'
import type { BlueprintData, TemplateData } from '../../types'

/* ---------- types ---------- */
interface ConfirmPanelProps {
  sessionId: string
  point: 'blueprint' | 'template' | 'selection'
  data: unknown
  onConfirmed: () => void
}

type Action = 'approve' | 'reject' | 'modify'

/* ---------- component ---------- */
export default function ConfirmPanel({ sessionId, point, data, onConfirmed }: ConfirmPanelProps) {
  const [action, setAction] = useState<Action | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isBlueprint = point === 'blueprint'
  const isTemplate = point === 'template'
  const blueprint = isBlueprint ? (data as BlueprintData) : null
  const template = isTemplate ? (data as TemplateData) : null

  /* which label to show */
  const titleLabels: Record<string, string> = {
    blueprint: '细目表确认',
    template: '模板确认',
    selection: '选题确认',
  }

  /* ---------- submit ---------- */
  const handleSubmit = async (chosen: Action) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: chosen,
          point,
          feedback: chosen === 'reject' ? feedback : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || `提交失败 (${res.status})`)
      }
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- render ---------- */
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{titleLabels[point]}</h3>
        {action && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
            {action === 'approve' ? '待提交' : action === 'reject' ? '待提交' : '待提交'}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* ---- blueprint table ---- */}
        {isBlueprint && blueprint && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-left px-3 py-2 border border-gray-200">知识点</th>
                  <th className="text-center px-2 py-2 border border-gray-200">基础</th>
                  <th className="text-center px-2 py-2 border border-gray-200">中等</th>
                  <th className="text-center px-2 py-2 border border-gray-200">较难</th>
                  <th className="text-center px-2 py-2 border border-gray-200">合计</th>
                  <th className="text-center px-2 py-2 border border-gray-200">频率</th>
                  <th className="text-center px-2 py-2 border border-gray-200">必考</th>
                </tr>
              </thead>
              <tbody>
                {blueprint.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">{row.kp}</td>
                    <td className="px-2 py-2 border border-gray-200 text-center text-gray-600">{row.basic}</td>
                    <td className="px-2 py-2 border border-gray-200 text-center text-gray-600">{row.medium}</td>
                    <td className="px-2 py-2 border border-gray-200 text-center text-gray-600">{row.hard}</td>
                    <td className="px-2 py-2 border border-gray-200 text-center font-medium text-gray-800">{row.total}</td>
                    <td className="px-2 py-2 border border-gray-200 text-center text-gray-600">{row.frequency}%</td>
                    <td className="px-2 py-2 border border-gray-200 text-center">
                      {row.required ? (
                        <span className="text-green-600 font-medium">是</span>
                      ) : (
                        <span className="text-gray-400">否</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* difficulty summary */}
            {blueprint.difficultySummary && (
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
                <span>难度分布：</span>
                <span className="text-green-600">基础 {blueprint.difficultySummary.basic}%</span>
                <span className="text-blue-600">中等 {blueprint.difficultySummary.medium}%</span>
                <span className="text-red-600">较难 {blueprint.difficultySummary.hard}%</span>
                <span className="text-gray-400">| 总分 {blueprint.totalScore}</span>
              </div>
            )}
          </div>
        )}

        {/* ---- template structure ---- */}
        {isTemplate && template && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>考试时长：{template.totalTime} 分钟</span>
              <span>页眉样式：{template.headerStyle}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left px-3 py-2 border border-gray-200">题型</th>
                    <th className="text-center px-2 py-2 border border-gray-200">题数</th>
                    <th className="text-center px-2 py-2 border border-gray-200">每题分值</th>
                    <th className="text-center px-2 py-2 border border-gray-200">小计</th>
                    <th className="text-left px-3 py-2 border border-gray-200">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {template.sections.map((sec, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">{sec.type}</td>
                      <td className="px-2 py-2 border border-gray-200 text-center text-gray-600">{sec.count}</td>
                      <td className="px-2 py-2 border border-gray-200 text-center text-gray-600">{sec.scorePer}</td>
                      <td className="px-2 py-2 border border-gray-200 text-center text-gray-800 font-medium">{sec.totalScore}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-500">{sec.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---- selection placeholder ---- */}
        {point === 'selection' && (
          <p className="text-sm text-gray-500">
            请在下方选择需要保留的试卷，然后确认。
          </p>
        )}

        {/* ---- error ---- */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ---- reject feedback ---- */}
        {action === 'reject' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">驳回意见</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              placeholder="请说明驳回原因或修改建议..."
            />
          </div>
        )}

        {/* ---- actions ---- */}
        <div className="flex items-center gap-3 pt-1">
          {action === null ? (
            <>
              <button
                onClick={() => setAction('approve')}
                className="px-5 py-2 text-sm font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
              >
                确认通过
              </button>
              <button
                onClick={() => setAction('reject')}
                className="px-5 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                驳回
              </button>
              <button
                onClick={() => setAction('modify')}
                className="px-5 py-2 text-sm font-medium rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
              >
                直接修改
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setAction(null); setFeedback('') }}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => handleSubmit(action)}
                disabled={submitting || (action === 'reject' && !feedback.trim())}
                className={`px-5 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 ${
                  action === 'approve'
                    ? 'bg-green-500 hover:bg-green-600'
                    : action === 'reject'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-yellow-500 hover:bg-yellow-600'
                }`}
              >
                {submitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
