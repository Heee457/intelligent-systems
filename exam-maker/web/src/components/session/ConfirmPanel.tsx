import { useState } from 'react'

/* ---------- types ---------- */
interface ConfirmPanelProps {
  sessionId: string
  point: 'blueprint' | 'template' | 'selection'
  data: unknown
  onConfirmed: () => void
}

type Action = 'approve' | 'reject' | 'modify'

interface ConfirmContent {
  content?: string
  type?: string
}

/* ---------- component ---------- */
export default function ConfirmPanel({ sessionId, point, data, onConfirmed }: ConfirmPanelProps) {
  const [action, setAction] = useState<Action | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmData = data as ConfirmContent
  const content = confirmData?.content || ''

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

  /* ---------- simple markdown renderer ---------- */
  function renderMarkdown(md: string) {
    const lines = md.split('\n')
    const elements: JSX.Element[] = []
    let inTable = false
    let tableRows: string[][] = []
    let tableHeader: string[] | null = null

    const flushTable = () => {
      if (tableHeader && tableRows.length > 0) {
        elements.push(
          <div key={`tbl-${elements.length}`} className="overflow-x-auto my-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  {tableHeader.map((h, i) => (
                    <th key={i} className="text-left px-2 py-1.5 border border-gray-200">{h.trim()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1.5 border border-gray-200 text-gray-700">{cell.trim()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      inTable = false
      tableHeader = null
      tableRows = []
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Table detection
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim())
        if (!inTable) {
          tableHeader = cells
          inTable = true
          continue
        }
        // Skip separator row (|---|---|)
        if (cells.every((c) => /^[-:]+$/.test(c))) continue
        tableRows.push(cells)
        continue
      } else {
        if (inTable) flushTable()
      }

      // Headings
      if (line.startsWith('# ')) {
        elements.push(<h2 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.replace(/^# /, '')}</h2>)
        continue
      }
      if (line.startsWith('## ')) {
        elements.push(<h3 key={i} className="text-base font-semibold text-gray-800 mt-3 mb-1">{line.replace(/^## /, '')}</h3>)
        continue
      }
      if (line.startsWith('### ')) {
        elements.push(<h4 key={i} className="text-sm font-semibold text-gray-700 mt-2 mb-1">{line.replace(/^### /, '')}</h4>)
        continue
      }

      // Empty lines
      if (line.trim() === '') {
        elements.push(<div key={i} className="h-2" />)
        continue
      }

      // Regular paragraph or list item
      elements.push(
        <p key={i} className="text-sm text-gray-700 leading-relaxed">
          {line.startsWith('- ') ? '• ' + line.slice(2) : line}
        </p>,
      )
    }

    // Flush any remaining table
    if (inTable) flushTable()

    return elements
  }

  /* ---------- render ---------- */
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{titleLabels[point]}</h3>
        {action && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
            待提交
          </span>
        )}
      </div>

      <div className="p-5 space-y-3">
        {/* ---- content display ---- */}
        {content ? (
          <div className="prose prose-sm max-w-none">{renderMarkdown(content)}</div>
        ) : point === 'selection' ? (
          <p className="text-sm text-gray-500">请在下方选择需要保留的试卷，然后确认。</p>
        ) : (
          <p className="text-sm text-gray-400">等待数据加载...</p>
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
        <div className="flex items-center gap-3 pt-2">
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
