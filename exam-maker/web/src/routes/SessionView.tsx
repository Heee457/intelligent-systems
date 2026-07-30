import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Session, SessionFile, SessionStatus, WsMessage, PaperData } from '../types'
import ProgressBar from '../components/session/ProgressBar'
import StepLog, { type LogEntry } from '../components/session/StepLog'
import ConfirmPanel from '../components/session/ConfirmPanel'
import PaperSelector from '../components/session/PaperSelector'

/* ---------- status helpers ---------- */
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
  AWAIT_BLUEPRINT: 'bg-amber-100 text-amber-700',
  AWAIT_TEMPLATE: 'bg-amber-100 text-amber-700',
  AWAIT_SELECTION: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  DONE: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

/* ---------- WebSocket URL ---------- */
function wsUrl(id: string): string {
  return `ws://localhost:3001/ws/sessions/${id}`
}

/* ---------- component ---------- */
export default function SessionView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  /* session state */
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionStatus>('CREATED')
  const [currentStep, setCurrentStep] = useState(0)
  const [stepDetail, setStepDetail] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [files, setFiles] = useState<SessionFile[]>([])
  const [papers, setPapers] = useState<PaperData[]>([])
  const [confirmPoint, setConfirmPoint] = useState<'blueprint' | 'template' | 'selection' | null>(null)
  const [confirmData, setConfirmData] = useState<unknown>(null)

  /* UI state */
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  /* ---------- fetch session ---------- */
  const fetchSession = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/sessions/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          navigateRef.current('/')
          return
        }
        throw new Error(`请求失败 (${res.status})`)
      }
      const data: Session = await res.json()
      setSession(data)
      setStatus(data.status)
      setCurrentStep(data.currentStep)
      setStepDetail(data.stepDetail)
      setFiles(data.files || [])
      setPapers(data.papers || [])

      /* if status is awaiting confirmation, show the corresponding panel */
      if (data.status === 'AWAIT_BLUEPRINT') {
        setConfirmPoint('blueprint')
        setConfirmData(data.blueprint)
      } else if (data.status === 'AWAIT_TEMPLATE') {
        setConfirmPoint('template')
        setConfirmData(data.template)
      } else if (data.status === 'AWAIT_SELECTION') {
        setConfirmPoint('selection')
        setConfirmData(data.papers)
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [id])

  /* ---------- WebSocket connection ---------- */
  useEffect(() => {
    if (!id) return

    const ws = new WebSocket(wsUrl(id))
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[SessionView] WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)

        switch (msg.type) {
          case 'step':
            setCurrentStep(msg.step)
            setStepDetail(msg.detail)
            break

          case 'log':
            setLogs((prev) => [...prev, { timestamp: Date.now(), message: msg.message }])
            break

          case 'artifact':
            setFiles((prev) => {
              if (prev.some((f) => f.name === msg.file.name)) return prev
              return [...prev, msg.file]
            })
            break

          case 'confirm':
            setConfirmPoint(msg.point)
            setConfirmData(msg.data)

            /* also store paper data when received via selection confirm */
            if (msg.point === 'selection') {
              setPapers(msg.data as PaperData[])
            }
            break

          case 'error':
            setError(msg.message)
            setLogs((prev) => [...prev, { timestamp: Date.now(), message: `[错误] ${msg.message}` }])
            break

          case 'complete':
            setSession(msg.session)
            setStatus(msg.session.status)
            setCurrentStep(msg.session.currentStep)
            setPapers(msg.session.papers || [])
            setConfirmPoint(null)
            setConfirmData(null)
            break
        }
      } catch {
        console.error('[SessionView] Failed to parse WS message')
      }
    }

    ws.onerror = () => {
      console.error('[SessionView] WebSocket error')
    }

    ws.onclose = () => {
      console.log('[SessionView] WebSocket closed')
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [id])

  /* ---------- initial fetch ---------- */
  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  /* ---------- confirm callback ---------- */
  const handleConfirmed = useCallback(() => {
    setConfirmPoint(null)
    setConfirmData(null)
    setStatus('RUNNING')
    fetchSession()
  }, [fetchSession])

  /* ---------- derived state ---------- */
  const awaitingConfirm = confirmPoint !== null && status.startsWith('AWAIT_')
  const showConfirmPanel = awaitingConfirm && confirmData != null
  const showPaperSelector = papers.length > 0 && (status === 'COMPLETED' || status === 'DONE' || status === 'AWAIT_SELECTION')

  /* ---------- render ---------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        加载中...
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="text-center py-24">
        <p className="text-sm text-red-500 mb-3">{fetchError}</p>
        <button
          onClick={fetchSession}
          className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
        >
          重试
        </button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-24 text-sm text-gray-400">
        会话未找到
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {session.config.course || '未命名课程'}
          </h1>
          {session.config.scope && (
            <p className="text-sm text-gray-400 mt-0.5">{session.config.scope}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{session.config.nSets} 套</span>
            <span>{session.config.outputFormat.toUpperCase()}</span>
            <span>创建于 {new Date(session.createdAt).toLocaleString('zh-CN')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}
          >
            {STATUS_LABELS[status] || status}
          </span>
          {stepDetail && (
            <span className="text-xs text-gray-400 max-w-[200px] truncate" title={stepDetail}>
              {stepDetail}
            </span>
          )}
        </div>
      </div>

      {/* ---- progress bar ---- */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <ProgressBar currentStep={currentStep} status={status} />
      </div>

      {/* ---- error banner ---- */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <span className="font-medium shrink-0">错误：</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* ---- confirm panel ---- */}
      {showConfirmPanel && (
        <ConfirmPanel
          sessionId={id!}
          point={confirmPoint!}
          data={confirmData}
          onConfirmed={handleConfirmed}
        />
      )}

      {/* ---- log panel ---- */}
      <div>
        <StepLog entries={logs} />
      </div>

      {/* ---- files / artifacts ---- */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">生成文件</h3>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <a
                key={f.name}
                href={`/api/sessions/${id}/files/${f.name}`}
                download={f.name}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-200 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {f.name}
                <span className="text-gray-400">({(f.size / 1024).toFixed(1)} KB)</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---- paper selector ---- */}
      {showPaperSelector && (
        <PaperSelector sessionId={id!} papers={papers} />
      )}
    </div>
  )
}
