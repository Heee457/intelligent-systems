import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import LatexRenderer from '../../components/shared/LatexRenderer'

const API = 'http://localhost:3001'

function statusText(status: string) {
  return status === 'graded' ? '已批阅' : '待批阅'
}

function statusClass(status: string) {
  return status === 'graded' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
}

function resultClass(answer: any) {
  if (answer.is_correct === 1) return 'border-green-200'
  if (answer.is_correct === 0) return 'border-red-200'
  return 'border-yellow-200'
}

function resultLabel(answer: any) {
  if (answer.is_correct === 1) return '正确'
  if (answer.is_correct === 0) return '需改进'
  return '待批阅'
}

export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore(s => s.token)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(API + '/api/student/submissions/' + id, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [id, token])

  if (loading) return <div className="text-center py-24 text-gray-400">加载中...</div>
  if (!data?.submission) return <div className="text-center py-24 text-gray-400">未找到</div>

  const { submission, answers, scoreVisible, answerVisible, events = [] } = data

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{submission.exam_title}</h1>
          <p className="text-sm text-gray-400">{new Date(submission.submitted_at).toLocaleString('zh-CN')}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-indigo-600">{scoreVisible ? String(submission.total_score ?? '—') + ' / ' + String(submission.total_points ?? '—') : '成绩待公布'}</p>
          <span className={'text-xs px-2 py-0.5 rounded-full ' + statusClass(submission.status)}>{statusText(submission.status)}</span>
        </div>
      </div>

      {events.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          <p className="font-medium mb-2">考试异常记录</p>
          <div className="space-y-1">
            {events.map((event: any, index: number) => (
              <p key={index}>{new Date(event.created_at).toLocaleString('zh-CN')}：{event.type}</p>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {answers.map((answer: any, index: number) => (
          <div key={index} className={'bg-white rounded-xl border p-5 ' + resultClass(answer)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-gray-500">第 {answer.question_order} 题</span>
                  <span className="text-xs text-gray-400">{scoreVisible ? '(' + String(answer.score ?? '—') + ' / ' + String(answer.max_score ?? '—') + ' 分)' : '(分数待公布)'}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{scoreVisible ? resultLabel(answer) : '待公布'}</span>
                </div>

                {answer.question && (
                  <>
                    <LatexRenderer content={answer.question.title} className="text-sm font-medium text-gray-800" />
                    <LatexRenderer content={answer.question.content} className="text-sm text-gray-500 mt-1" />
                    {answer.question.knowledgePoints?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {answer.question.knowledgePoints.map((kp: string) => <span key={kp} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{kp}</span>)}
                      </div>
                    )}

                    {answer.question.type === 'choice' && answer.question.options && (
                      <div className="mt-3 space-y-1">
                        {answer.question.options.map((opt: any) => {
                          const selected = opt.id === answer.studentAnswer?.selectedOptionId
                          const correct = answerVisible && opt.id === answer.question.answer?.selectedOptionId
                          return (
                            <div key={opt.id} className={'text-sm flex items-start gap-1.5 ' + (selected ? 'font-bold ' : '') + (correct ? 'text-green-600' : '')}>
                              <span className="shrink-0">{opt.label}.</span>
                              <LatexRenderer content={opt.content} className="min-w-0 flex-1" />
                              {correct && <span className="shrink-0">正确答案</span>}
                              {selected && !correct && <span className="shrink-0">我的答案</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">我的答案</p>
                        <p className="whitespace-pre-wrap break-words">{answer.studentAnswerText || '未作答'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">参考答案</p>
                        <p className="whitespace-pre-wrap break-words">{answerVisible ? answer.referenceAnswerText || '—' : '暂未公布'}</p>
                      </div>
                    </div>

                    {answerVisible && answer.question.explanation && (
                      <div className="mt-3 text-sm text-gray-600 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                        <span className="font-medium text-indigo-700">解析：</span>{answer.question.explanation}
                      </div>
                    )}
                    {scoreVisible && answer.teacher_notes && (
                      <p className="text-xs text-indigo-600 mt-2">教师批注：{answer.teacher_notes}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
