import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthLayout from './components/layout/AuthLayout'
import TeacherLayout from './components/layout/TeacherLayout'
import StudentLayout from './components/layout/StudentLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Login from './routes/Login'
import Register from './routes/Register'
import Dashboard from './routes/Dashboard'
import QuestionBank from './routes/QuestionBank'
import ExamGenerator from './routes/ExamGenerator'
import ExamList from './routes/ExamList'
import ExamViewer from './routes/ExamViewer'
import History from './routes/History'
import SessionView from './routes/SessionView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes — no nav */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Teacher routes */}
        <Route
          element={
            <ProtectedRoute role="teacher">
              <TeacherLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/questions" element={<QuestionBank />} />
          <Route path="/generator" element={<ExamGenerator />} />
          <Route path="/exams" element={<ExamList />} />
          <Route path="/exams/:id" element={<ExamViewer />} />
          <Route path="/session/:id" element={<SessionView />} />
          <Route path="/history" element={<History />} />
        </Route>

        {/* Student routes — placeholder for Phase 3 */}
        <Route
          element={
            <ProtectedRoute role="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/student/dashboard" element={<StudentPlaceholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function StudentPlaceholder() {
  return (
    <div className="text-center py-24 text-gray-400 text-sm">
      🎓 学生端即将上线
    </div>
  )
}
