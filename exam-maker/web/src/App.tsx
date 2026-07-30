import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './routes/Dashboard'
import QuestionBank from './routes/QuestionBank'
import ExamGenerator from './routes/ExamGenerator'
import ExamList from './routes/ExamList'
import ExamViewer from './routes/ExamViewer'
import History from './routes/History'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/questions" element={<QuestionBank />} />
          <Route path="/generator" element={<ExamGenerator />} />
          <Route path="/exams" element={<ExamList />} />
          <Route path="/exams/:id" element={<ExamViewer />} />
          <Route path="/history" element={<History />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
