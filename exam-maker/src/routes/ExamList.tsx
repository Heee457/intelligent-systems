import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamStore } from '../store/examStore'
import EmptyState from '../components/shared/EmptyState'
import ConfirmDialog from '../components/shared/ConfirmDialog'

export default function ExamList() {
  const navigate = useNavigate()
  const { exams, deleteExam, duplicateExam } = useExamStore()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">试卷管理</h1>
        <button onClick={() => navigate('/generator')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 font-medium">
          + 新建试卷
        </button>
      </div>

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
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-800">{exam.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
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
                  onClick={(e) => { e.stopPropagation(); duplicateExam(exam.id) }}
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
