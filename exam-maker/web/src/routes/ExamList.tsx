import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../store/examStore'
import { useAuthStore } from '../store/authStore'
import EmptyState from '../components/shared/EmptyState'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import PublishManagementPanel from '../components/exams/PublishManagementPanel'
import type { Exam } from '../types'

const API = 'http://localhost:3001'

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  smart: '智能组卷',
  'ai-session': 'AI命题',
  remedial: '补救练习',
  retake: '重测卷',
}


export default function ExamList() {
  const navigate = useNavigate()
  const { exams, deleteExam, createExam, updateExam, fetchExams } = useExamStore()
  const token = useAuthStore(s => s.token)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [publishes, setPublishes] = useState<any[]>([])

  const refreshPublishes = async () => {
    const res = await fetch(API + '/api/publish', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    if (!res.ok) return
    const data = await res.json()
    setPublishes(data.publishes || [])
  }

  // 挂载时从 API 加载试卷和发布记录
  useEffect(() => { fetchExams(); refreshPublishes() }, [token])

  // 复制：新 store 无 duplicateExam，用 createExam + updateExam 组合实现
  const handleDuplicate = async (exam: Exam) => {
    const copy = await createExam(exam.title + ' (副本)')
    if (copy) {
      await updateExam(copy.id, { questions: exam.questions, totalScore: exam.totalScore, status: 'draft' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">试卷管理</h1>
        <button onClick={() => navigate('/generator')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 font-medium">
          + 新建试卷
        </button>
      </div>

      <PublishManagementPanel
        publishes={publishes}
        title="发布管理"
        emptyMessage="还没有发布记录。发布试卷后，这里会显示班级、可见学生、开始和提交进度。"
        onRefresh={refreshPublishes}
        onPublishUpdated={(publish) => setPublishes((prev) => prev.map((item) => item.id === publish.id ? publish : item))}
      />

      {exams.length === 0 ? (
        <EmptyState
          icon="📄"
          title="还没有试卷"
          description="前往组卷工具创建第一份试卷"
          action={
            <button onClick={() => navigate('/generator')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">
              去组卷
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/exams/${exam.id}`)}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-800 line-clamp-2">{exam.title}</h3>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
                      {SOURCE_LABELS[exam.source || 'manual'] || exam.source}
                    </span>
                    {exam.isRecommended && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">推荐</span>
                    )}
                    {exam.paperIndex && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">第 {exam.paperIndex} 套</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">v{exam.versionNumber || 1}</span>
                    {exam.lockedAt && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">已锁定</span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                  exam.status === 'published'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-yellow-50 text-yellow-600'
                }`}>
                  {exam.status === 'published' ? '已发布' : '草稿'}
                </span>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p>{exam.questions.length} 道题 · 总分 {exam.totalScore}</p>
                <p>更新于 {new Date(exam.updatedAt).toLocaleDateString('zh-CN')}</p>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(exam) }}
                  className="text-xs px-3 py-1 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  复制
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteId(exam.id) }}
                  className="text-xs px-3 py-1 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteExam(deleteId); setDeleteId(null) }}
        title="删除试卷"
        message="确定要删除这份试卷吗？此操作不可撤销。"
        confirmLabel="删除"
        danger
      />
    </div>
  )
}
