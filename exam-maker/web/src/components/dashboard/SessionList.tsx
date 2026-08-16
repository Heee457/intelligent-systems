import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session, SessionStatus } from '../../types'
import { useAuthStore } from '../../store/authStore'
import EmptyState from '../shared/EmptyState'

const STATUS_LABELS: Record<SessionStatus, string> = {
  CREATED: '已创建',
  RUNNING: '运行中',
  AWAIT_BLUEPRINT: '等待蓝图确认',
  AWAIT_TEMPLATE: '等待模板确认',
  AWAIT_SELECTION: '等待选题确认',
  COMPLETED: '已完成',
  DONE: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

const STATUS_STYLES: Record<SessionStatus, string> = {
  CREATED: 'bg-gray-100 text-gray-600',
  RUNNING: 'bg-blue-100 text-blue-700',
  AWAIT_BLUEPRINT: 'bg-yellow-100 text-yellow-700',
  AWAIT_TEMPLATE: 'bg-yellow-100 text-yellow-700',
  AWAIT_SELECTION: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  DONE: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}

export default function SessionList() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch('/api/sessions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        throw new Error(`请求失败 (${res.status})`)
      }
      const data: Session[] = await res.json()
      setSessions(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        加载中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-500 mb-3">{error}</p>
        <button
          onClick={fetchSessions}
          className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
        >
          重试
        </button>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="暂无历史任务"
        description="点击上方「开始命题」按钮创建你的第一个任务"
      />
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => navigate(`/session/${session.id}`)}
          className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-gray-900">
                {session.config.course || '未命名课程'}
              </h3>
              {session.config.scope && (
                <p className="text-xs text-gray-400 mt-0.5">{session.config.scope}</p>
              )}
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[session.status] || 'bg-gray-100 text-gray-600'}`}
            >
              {STATUS_LABELS[session.status] || session.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>{session.config.nSets} 套</span>
            <span>{session.config.outputFormat.toUpperCase()}</span>
            <span>{formatDate(session.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
