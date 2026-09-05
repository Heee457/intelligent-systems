import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

type PublishRecord = Record<string, any>

type Props = {
  publishes: PublishRecord[]
  title?: string
  emptyMessage?: string
  onRefresh?: () => void | Promise<void>
  onPublishUpdated?: (publish: PublishRecord) => void
}

function field(publish: PublishRecord, camel: string, snake: string) {
  return publish[camel] ?? publish[snake]
}

function numberField(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatDateTime(value: unknown) {
  const time = Number(value)
  if (!Number.isFinite(time) || time <= 0) return '未设置'
  return new Date(time).toLocaleString('zh-CN')
}

function toDateTimeLocal(value: unknown) {
  const time = Number(value)
  if (!Number.isFinite(time) || time <= 0) return ''
  const date = new Date(time)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function statusLabel(status: string) {
  if (status === 'published') return '发布中'
  if (status === 'withdrawn') return '已撤回'
  return status || '未发布'
}

function statusClass(status: string) {
  if (status === 'published') return 'bg-green-50 text-green-700 border-green-100'
  if (status === 'withdrawn') return 'bg-gray-100 text-gray-600 border-gray-200'
  return 'bg-yellow-50 text-yellow-700 border-yellow-100'
}

function releaseText(publish: PublishRecord) {
  const scoreReleaseTime = field(publish, 'scoreReleaseTime', 'score_release_time')
  return scoreReleaseTime ? '固定：' + formatDateTime(scoreReleaseTime) : '交卷后自动公布'
}

export default function PublishManagementPanel({ publishes, title = '发布管理', emptyMessage = '暂无发布记录', onRefresh, onPublishUpdated }: Props) {
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})

  const sortedPublishes = useMemo(() => {
    return [...publishes].sort((a, b) => numberField(field(b, 'createdAt', 'created_at')) - numberField(field(a, 'createdAt', 'created_at')))
  }, [publishes])

  const updatePublish = async (publishId: string, payload: Record<string, unknown>) => {
    setUpdatingId(publishId)
    try {
      const res = await fetch(API + '/api/publish/' + publishId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || '发布记录更新失败')
        return
      }
      if (data?.publish) onPublishUpdated?.(data.publish)
    } finally {
      setUpdatingId(null)
    }
  }

  const setFixedScoreRelease = async (publish: PublishRecord) => {
    const publishId = publish.id
    const value = scoreInputs[publishId] ?? toDateTimeLocal(field(publish, 'scoreReleaseTime', 'score_release_time'))
    const time = fromDateTimeLocal(value)
    if (!time) {
      alert('请选择固定成绩公布时间')
      return
    }
    await updatePublish(publishId, { scoreReleaseTime: time })
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400 mt-1">发布到哪些班级、可见人数、开始和提交进度都在这里统一管理。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{sortedPublishes.length} 条发布</span>
          {onRefresh && (
            <button onClick={() => onRefresh()} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">刷新</button>
          )}
        </div>
      </div>

      {sortedPublishes.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg px-4 py-6 text-sm text-gray-400 text-center">{emptyMessage}</div>
      ) : (
        <div className="space-y-3">
          {sortedPublishes.map((publish) => {
            const status = String(publish.status || 'draft')
            const active = status === 'published'
            const publishId = String(publish.id)
            const examId = field(publish, 'examId', 'exam_id')
            const className = publish.className || '未指定班级'
            const endTime = field(publish, 'endTime', 'end_time')
            const scoreValue = scoreInputs[publishId] ?? toDateTimeLocal(field(publish, 'scoreReleaseTime', 'score_release_time'))
            const busy = updatingId === publishId
            return (
              <div key={publishId} className="border border-gray-100 rounded-lg p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{publish.title}</p>
                      <span className={'text-xs px-2 py-0.5 rounded-full border ' + statusClass(status)}>{statusLabel(status)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      试卷：{publish.examTitle || examId || '未知试卷'} · 班级：{className} · 时长 {publish.duration} 分钟
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {examId && <button onClick={() => navigate('/exams/' + examId)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">查看试卷</button>}
                    <button onClick={() => navigate('/exams/' + publishId + '/analysis')} className="px-3 py-1.5 text-xs rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50">分析</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400">可见学生</p>
                    <p className="text-lg font-semibold text-gray-900">{publish.studentCount || 0}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400">已开始</p>
                    <p className="text-lg font-semibold text-gray-900">{publish.startedCount || 0}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400">已提交</p>
                    <p className="text-lg font-semibold text-gray-900">{publish.submittedCount || 0}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400">已批阅</p>
                    <p className="text-lg font-semibold text-gray-900">{publish.gradedCount || 0}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs text-gray-500">
                  <span>开始：{formatDateTime(field(publish, 'startTime', 'start_time'))}</span>
                  <span>截止：{formatDateTime(endTime)}</span>
                  <span>成绩：{releaseText(publish)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                  {active ? (
                    <button disabled={busy} onClick={() => updatePublish(publishId, { status: 'withdrawn' })} className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">撤回发布</button>
                  ) : (
                    <button disabled={busy} onClick={() => updatePublish(publishId, { status: 'published' })} className="px-3 py-1.5 text-xs rounded-lg border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-50">恢复发布</button>
                  )}
                  <button disabled={busy} onClick={() => updatePublish(publishId, { endTime: (numberField(endTime) || Date.now()) + 24 * 60 * 60 * 1000 })} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">截止延后 1 天</button>
                  <button disabled={busy} onClick={() => updatePublish(publishId, { scoreReleaseTime: null })} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">成绩自动公布</button>
                  <input
                    type="datetime-local"
                    value={scoreValue}
                    onChange={(e) => setScoreInputs((prev) => ({ ...prev, [publishId]: e.target.value }))}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600"
                    aria-label="固定成绩公布时间"
                  />
                  <button disabled={busy} onClick={() => setFixedScoreRelease(publish)} className="px-3 py-1.5 text-xs rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">固定公布</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
