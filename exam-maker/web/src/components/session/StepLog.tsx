import { useEffect, useRef } from 'react'

/* ---------- types ---------- */
export interface LogEntry {
  timestamp: number
  message: string
}

interface StepLogProps {
  entries: LogEntry[]
}

/* ---------- component ---------- */
export default function StepLog({ entries }: StepLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  /* auto-scroll when new entries arrive */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
        暂无日志
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-gray-400 ml-2">运行日志</span>
      </div>
      <div className="h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-gray-500 shrink-0 w-20 text-right">
              {formatTime(entry.timestamp)}
            </span>
            <span className="text-gray-200 break-all">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

/* ---------- helpers ---------- */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
