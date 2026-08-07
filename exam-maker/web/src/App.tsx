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
import SessionView from './routes/SessionView'
import ClassList from './routes/ClassList'
import ClassDetail from './routes/ClassDetail'
import ExamAnalysis from './routes/ExamAnalysis'
import GradingCenter from './routes/GradingCenter'
import StudentDetail from './routes/StudentDetail'
import StudentDashboard from './routes/student/StudentDashboard'
import ExamTaking from './routes/student/ExamTaking'
import StudentGrades from './routes/student/StudentGrades'
import SubmissionDetail from './routes/student/SubmissionDetail'

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
          <Route path="/classes" element={<ClassList />} />
          <Route path="/classes/:id" element={<ClassDetail />} />
          <Route path="/exams/:id/analysis" element={<ExamAnalysis />} />
          <Route path="/grading" element={<GradingCenter />} />
          <Route path="/students/:id" element={<StudentDetail />} />
        </Route>

        {/* Student routes */}
        <Route
          element={
            <ProtectedRoute role="student">
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/exam/:publishId" element={<ExamTaking />} />
          <Route path="/student/grades" element={<StudentGrades />} />
          <Route path="/student/submission/:id" element={<SubmissionDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
