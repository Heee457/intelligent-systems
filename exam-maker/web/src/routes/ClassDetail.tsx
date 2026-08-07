import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>()
  const [classData, setClassData] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [classRes, studentRes] = await Promise.all([
      fetch(`${API}/api/classes`, { headers: headers() }),
      fetch(`${API}/api/classes/${id}/students`, { headers: headers() }),
    ])
    const classes = await classRes.json()
    const studentData = await studentRes.json()
    setClassData(Array.isArray(classes) ? classes.find((c: any) => c.id === id) : null)
    setStudents(studentData.students || [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddStudents = async () => {
    const emails = emailInput.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    if (emails.length === 0) return
    const res = await fetch(`${API}/api/classes/${id}/students`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ emails }),
    })
    const data = await res.json()
    alert(`成功添加 ${data.added} 名学生`)
    setEmailInput('')
    fetchData()
  }

  const handleRemove = async (sid: string) => {
    await fetch(`${API}/api/classes/${id}/students/${sid}`, { method: 'DELETE', headers: headers() })
    fetchData()
  }

  if (loading || !classData) return <div className="text-center py-12 text-gray-400">加载中...</div>

  return (
    <div>
      <Link to="/classes" className="text-sm text-indigo-600 hover:text-indigo-800 mb-4 inline-block">← 返回班级列表</Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
          <p className="text-sm text-gray-400 mt-1">邀请码: <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-600 font-mono">{classData.join_code}</code></p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">添加学生</h3>
          <textarea value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="输入学生邮箱，每行一个或用逗号分隔" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none mb-3" />
          <button onClick={handleAddStudents} className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm">添加</button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">学生列表 ({students.length})</h3>
          {students.length === 0 ? (
            <p className="text-sm text-gray-400">暂无学生</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {students.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.email}</p>
                  </div>
                  <button onClick={() => handleRemove(s.id)} className="text-xs text-red-400 hover:text-red-600">移除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
