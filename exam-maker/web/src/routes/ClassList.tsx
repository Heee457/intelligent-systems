import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const API = 'http://localhost:3001'

function headers() {
  const token = useAuthStore.getState().token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export default function ClassList() {
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`${API}/api/classes`, { headers: headers() })
    const data = await res.json()
    setClasses(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch(`${API}/api/classes`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ name, description }),
    })
    setName(''); setDescription(''); setShowCreate(false)
    fetchClasses()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此班级？')) return
    await fetch(`${API}/api/classes/${id}`, { method: 'DELETE', headers: headers() })
    fetchClasses()
  }

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">班级管理</h1>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">+ 创建班级</button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200">
          <form onSubmit={handleCreate} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">班级名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 outline-none" required />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 outline-none" />
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm">创建</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">取消</button>
          </form>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="text-center py-24 text-gray-400 text-sm">还没有班级，点击上方按钮创建</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {classes.map((c: any) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <Link to={`/classes/${c.id}`} className="text-lg font-semibold text-gray-900 hover:text-indigo-600">{c.name}</Link>
              <p className="text-sm text-gray-400 mt-1">{c.description || '无描述'}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-500">邀请码: <code className="bg-gray-100 px-1 rounded">{c.join_code}</code></span>
                <span className="text-xs text-gray-400">{c.studentCount || 0} 名学生</span>
              </div>
              <button onClick={() => handleDelete(c.id)} className="mt-3 text-xs text-red-400 hover:text-red-600">删除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
