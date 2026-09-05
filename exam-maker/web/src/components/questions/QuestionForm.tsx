import { useState, useEffect } from 'react'
import type { Question, QuestionType, Difficulty, ChoiceOption, MatchPair, Answer } from '../../types'
import { useQuestionStore } from '../../store/questionStore'
import TagInput from '../shared/TagInput'
import { generateId } from '../../utils/id'

interface QuestionFormProps {
  question?: Question | null
  onSaved: () => void
  onCancel: () => void
}

const TYPE_LABELS: Record<QuestionType, string> = {
  choice: '选择题',
  truefalse: '判断题',
  fillblank: '填空题',
  essay: '问答题',
  match: '匹配题',
  ordering: '排序题',
}

function defaultAnswer(type: QuestionType): Answer {
  switch (type) {
    case 'choice': return { type: 'choice', selectedOptionId: '' }
    case 'truefalse': return { type: 'truefalse', value: true }
    case 'fillblank': return { type: 'fillblank', blanks: [''] }
    case 'essay': return { type: 'essay', referenceAnswer: '' }
    case 'match': return { type: 'match', pairs: [] }
    case 'ordering': return { type: 'ordering', orderedItems: [] }
  }
}

export default function QuestionForm({ question, onSaved, onCancel }: QuestionFormProps) {
  const { addQuestion, updateQuestion } = useQuestionStore()
  const isEdit = !!question

  const [type, setType] = useState<QuestionType>(question?.type ?? 'choice')
  const [title, setTitle] = useState(question?.title ?? '')
  const [content, setContent] = useState(question?.content ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [knowledgePoints, setKnowledgePoints] = useState<string[]>(question?.knowledgePoints ?? [])
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [answer, setAnswer] = useState<Answer>(question?.answer ?? defaultAnswer(type))

  // 选择题选项
  const [options, setOptions] = useState<ChoiceOption[]>(
    question?.options ?? [
      { id: generateId(), label: 'A', content: '' },
      { id: generateId(), label: 'B', content: '' },
      { id: generateId(), label: 'C', content: '' },
      { id: generateId(), label: 'D', content: '' },
    ],
  )
  // 匹配题配对
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>(
    question?.matchPairs ?? [{ id: generateId(), left: '', right: '' }],
  )
  // 排序题项
  const [orderingItems, setOrderingItems] = useState<string[]>(
    question?.orderingItems ?? ['', '', ''],
  )

  // 切换题型时重置答案
  useEffect(() => {
    if (!isEdit) {
      setAnswer(defaultAnswer(type))
    }
  }, [type, isEdit])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const base = { type, title, content, difficulty, knowledgePoints, explanation }

    if (isEdit && question) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = { ...base, answer }
      if (type === 'choice') data.options = options
      if (type === 'match') data.matchPairs = matchPairs
      if (type === 'ordering') data.orderingItems = orderingItems
      updateQuestion(question.id, data)
    } else {
      addQuestion({ ...base, answer, options: type === 'choice' ? options : undefined, matchPairs: type === 'match' ? matchPairs : undefined, orderingItems: type === 'ordering' ? orderingItems : undefined })
    }
    onSaved()
  }

  const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'
  const INPUT_CLS = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 题型选择 */}
      <div>
        <label className={LABEL_CLS}>题型</label>
        <select value={type} onChange={(e) => setType(e.target.value as QuestionType)} className={INPUT_CLS}>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 标题 */}
      <div>
        <label className={LABEL_CLS}>标题</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} placeholder="简短标题，如：二次函数顶点坐标" required />
      </div>

      {/* 题干 */}
      <div>
        <label className={LABEL_CLS}>题干</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} className={INPUT_CLS} rows={3} placeholder="题目内容..." required />
      </div>

      {/* 选择题：选项 */}
      {type === 'choice' && (
        <div>
          <label className={LABEL_CLS}>选项</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 w-6">{opt.label}</span>
                <input
                  value={opt.content}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = { ...next[i], content: e.target.value }
                    setOptions(next)
                  }}
                  className={INPUT_CLS}
                  placeholder={`选项 ${opt.label}`}
                  required
                />
                <input
                  type="radio"
                  name="correctOption"
                  checked={answer.type === 'choice' && answer.selectedOptionId === opt.id}
                  onChange={() => setAnswer({ type: 'choice', selectedOptionId: opt.id })}
                  className="w-4 h-4 accent-indigo-500"
                  title="设为正确答案"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 判断题：答案 */}
      {type === 'truefalse' && (
        <div>
          <label className={LABEL_CLS}>正确答案</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={answer.type === 'truefalse' && answer.value === true} onChange={() => setAnswer({ type: 'truefalse', value: true })} className="accent-green-500" />
              <span className="text-sm text-green-700 font-medium">✓ 正确</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={answer.type === 'truefalse' && answer.value === false} onChange={() => setAnswer({ type: 'truefalse', value: false })} className="accent-red-500" />
              <span className="text-sm text-red-700 font-medium">✗ 错误</span>
            </label>
          </div>
        </div>
      )}

      {/* 填空题：空格 */}
      {type === 'fillblank' && (
        <div>
          <label className={LABEL_CLS}>填空答案（每个填空用逗号分隔多个可接受答案）</label>
          <div className="space-y-2">
            {(answer.type === 'fillblank' ? answer.blanks : ['']).map((blank, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-gray-500">空{i + 1}</span>
                <input
                  value={blank}
                  onChange={(e) => {
                    if (answer.type === 'fillblank') {
                      const blanks = [...answer.blanks]
                      blanks[i] = e.target.value
                      setAnswer({ ...answer, blanks })
                    }
                  }}
                  className={INPUT_CLS}
                  placeholder="答案"
                />
                {i > 0 && (
                  <button type="button" onClick={() => {
                    if (answer.type === 'fillblank') {
                      setAnswer({ ...answer, blanks: answer.blanks.filter((_, j) => j !== i) })
                    }
                  }} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => {
            if (answer.type === 'fillblank') {
              setAnswer({ ...answer, blanks: [...answer.blanks, ''] })
            }
          }} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">
            + 添加填空
          </button>
        </div>
      )}

      {/* 问答题：参考答案 */}
      {type === 'essay' && (
        <div>
          <label className={LABEL_CLS}>参考答案</label>
          <textarea
            value={answer.type === 'essay' ? answer.referenceAnswer : ''}
            onChange={(e) => setAnswer({ type: 'essay', referenceAnswer: e.target.value })}
            className={INPUT_CLS} rows={4} placeholder="参考答案..."
          />
        </div>
      )}

      {/* 匹配题 */}
      {type === 'match' && (
        <div>
          <label className={LABEL_CLS}>配对项</label>
          <div className="space-y-2">
            {matchPairs.map((pair, i) => (
              <div key={pair.id} className="flex items-center gap-2">
                <input value={pair.left} onChange={(e) => {
                  const next = [...matchPairs]
                  next[i] = { ...next[i], left: e.target.value }
                  setMatchPairs(next)
                }} className={INPUT_CLS} placeholder="左项" />
                <span className="text-gray-400">—</span>
                <input value={pair.right} onChange={(e) => {
                  const next = [...matchPairs]
                  next[i] = { ...next[i], right: e.target.value }
                  setMatchPairs(next)
                }} className={INPUT_CLS} placeholder="右项" />
                {matchPairs.length > 1 && (
                  <button type="button" onClick={() => setMatchPairs(matchPairs.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setMatchPairs([...matchPairs, { id: generateId(), left: '', right: '' }])} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">
            + 添加配对
          </button>
        </div>
      )}

      {/* 排序题 */}
      {type === 'ordering' && (
        <div>
          <label className={LABEL_CLS}>排序项（按正确顺序排列）</label>
          <div className="space-y-2">
            {orderingItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                <input value={item} onChange={(e) => {
                  const next = [...orderingItems]
                  next[i] = e.target.value
                  setOrderingItems(next)
                }} className={INPUT_CLS} placeholder={`第 ${i + 1} 项`} />
                {orderingItems.length > 2 && (
                  <button type="button" onClick={() => setOrderingItems(orderingItems.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setOrderingItems([...orderingItems, ''])} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">
            + 添加项
          </button>
        </div>
      )}

      {/* 难度 */}
      <div>
        <label className={LABEL_CLS}>难度</label>
        <div className="flex gap-2">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                difficulty === d
                  ? d === 'easy' ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                  : d === 'medium' ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300'
                  : 'bg-red-100 text-red-700 ring-1 ring-red-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {{ easy: '简单', medium: '中等', hard: '困难' }[d]}
            </button>
          ))}
        </div>
      </div>

      {/* 知识点 */}
      <div>
        <label className={LABEL_CLS}>知识点</label>
        <TagInput tags={knowledgePoints} onChange={setKnowledgePoints} placeholder="输入知识点后按回车" />
      </div>

      {/* 解析 */}
      <div>
        <label className={LABEL_CLS}>解析（可选）</label>
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} className={INPUT_CLS} rows={2} placeholder="题目解析..." />
      </div>

      {/* 按钮 */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          取消
        </button>
        <button type="submit" className="px-5 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 font-medium">
          {isEdit ? '保存修改' : '创建题目'}
        </button>
      </div>
    </form>
  )
}
