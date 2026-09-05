import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { Authorization: `Bearer ${token}` }
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [publishes, setPublishes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joinMsg, setJoinMsg] = useState('')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`${API}/api/student/dashboard`, { headers: headers() })
    const data = await res.json()
    setPublishes(data.publishes || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const handleJoin = async () => {
    const res = await fetch(`${API}/api/student/classes/join`, {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode }),
    })
    const d = await res.json()
    setJoinMsg(d.class ? `已加入：${d.class.name}` : d.error || '失败')
    setJoinCode('')
    if (d.class) await fetchDashboard()
  }

  const handleStart = async (publishId: string) => {
    const res = await fetch(`${API}/api/student/exam/${publishId}/start`, {
      method: 'POST', headers: headers(),
    })
    const d = await res.json()
    if (d.submissionId) navigate(`/student/exam/${publishId}?sid=${d.submissionId}`)
    else alert(d.error || '无法开始考试')
  }

  const ongoing = publishes.filter((p: any) => p.submission?.status === 'started')
  const available = publishes.filter((p: any) => !p.submission && p.windowStatus === 'open')
  const scheduled = publishes.filter((p: any) => !p.submission && p.windowStatus === 'scheduled')
  const completed = publishes.filter((p: any) => p.submission?.status === 'submitted' || p.submission?.status === 'graded')

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">考试大厅</h1>
        <div className="flex gap-3 items-center bg-white rounded-xl border border-gray-200 p-4">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="输入班级邀请码" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
          <button onClick={handleJoin} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm">加入班级</button>
          {joinMsg && <span className="text-sm text-gray-500">{joinMsg}</span>}
        </div>
      </div>

      {ongoing.length > 0 && (
        <Section title="进行中" publishes={ongoing} onStart={handleStart} highlight />
      )}

      <Section title="可参加考试" publishes={available} onStart={handleStart} />
      <Section title="即将开始" publishes={scheduled} onStart={handleStart} scheduled />
      <Section title="已结束" publishes={completed} onStart={handleStart} done />
    </div>
  )
}

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '不限'
}

function Section({ title, publishes, onStart, highlight, done, scheduled }: any) {
  if (publishes.length === 0) return null
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="grid grid-cols-3 gap-4">
        {publishes.map((p: any) => (
          <div key={p.id} className={`bg-white rounded-xl border p-5 ${highlight ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
            <h3 className="font-semibold text-gray-900">{p.title}</h3>
            <p className="text-sm text-gray-400 mt-1">时长：{p.duration} 分钟</p>
            <p className="text-xs text-gray-400 mt-1">开放：{formatTime(p.startTime)} - {formatTime(p.endTime)}</p>
            {p.submission && (
              <p className="text-sm text-gray-400">得分：{p.submission.scoreVisible ? (p.submission.total_score ?? '—') : '待公布'} / {p.exam_total_score}</p>
            )}
            {!done && (
              <button onClick={() => onStart(p.id)} disabled={!p.canStart} className="mt-3 px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {scheduled ? '未开始' : p.submission ? '继续答题' : '开始考试'}
              </button>
            )}
            {done && p.submission && (
              <button onClick={() => window.location.href = `/student/submission/${p.submission.id}`} className="mt-3 px-4 py-1.5 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50">
                查看详情
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
