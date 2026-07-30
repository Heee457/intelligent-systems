import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionConfig } from '../types'
import ConfigForm, { type ConfigFormValues } from '../components/dashboard/ConfigForm'
import FileUploader, { type UploadedFile } from '../components/dashboard/FileUploader'
import SessionList from '../components/dashboard/SessionList'

const DEFAULT_VALUES: ConfigFormValues = {
  course: '',
  scope: '',
  difficulty: '基础60% 中等30% 难10%',
  nSets: 8,
  outputFormat: 'latex',
  verifyMode: 'auto',
}

let fileIdCounter = 0
function nextFileId(): string {
  return `file_${++fileIdCounter}_${Date.now()}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<ConfigFormValues>(DEFAULT_VALUES)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfigChange = useCallback((values: ConfigFormValues) => {
    setConfig(values)
  }, [])

  const handleFilesAdd = useCallback((files: File[]) => {
    setUploadedFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ id: nextFileId(), file: f })),
    ])
  }, [])

  const handleFileRemove = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleStartGeneration = useCallback(async () => {
    if (!config.course.trim()) {
      setError('请输入课程名称')
      return
    }
    setError(null)
    setGenerating(true)

    try {
      // 1. POST /api/sessions (multipart form)
      const formData = new FormData()
      const sessionConfig: SessionConfig = {
        course: config.course,
        scope: config.scope || undefined,
        difficulty: config.difficulty,
        nSets: config.nSets,
        outputFormat: config.outputFormat,
        verifyMode: config.verifyMode,
      }
      formData.append('config', JSON.stringify(sessionConfig))

      for (const item of uploadedFiles) {
        formData.append('files', item.file)
      }

      const createRes = await fetch('/api/sessions', {
        method: 'POST',
        body: formData,
      })

      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error || `创建会话失败 (${createRes.status})`)
      }

      const { id } = (await createRes.json()) as { id: string }

      // 2. POST /api/sessions/:id/start
      const startRes = await fetch(`/api/sessions/${id}/start`, {
        method: 'POST',
      })

      if (!startRes.ok) {
        const errBody = await startRes.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error || `启动会话失败 (${startRes.status})`)
      }

      // 3. Navigate to session page
      navigate(`/session/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误')
    } finally {
      setGenerating(false)
    }
  }, [config, uploadedFiles, navigate])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">智能命题仪表盘</h1>
        <p className="text-sm text-gray-500 mt-1">配置命题参数，上传参考真题，自动生成试卷</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Left column: Config + Upload */}
        <div className="lg:col-span-2 space-y-6">
          {/* Config card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold mb-4">命题配置</h2>
            <ConfigForm onChange={handleConfigChange} values={config} />
          </div>

          {/* Upload card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <FileUploader
              files={uploadedFiles}
              onAdd={handleFilesAdd}
              onRemove={handleFileRemove}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleStartGeneration}
            disabled={generating}
            className="w-full px-6 py-3 text-base bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在生成...
              </span>
            ) : (
              '开始命题'
            )}
          </button>
        </div>

        {/* Right column: Session history */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold mb-4">历史任务</h2>
            <SessionList />
          </div>
        </div>
      </div>
    </div>
  )
}
