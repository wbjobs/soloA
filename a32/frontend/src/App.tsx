import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { SamplesPage } from './pages/SamplesPage'
import { GenomeBrowserPage } from './pages/GenomeBrowserPage'
import { TasksPage } from './pages/TasksPage'
import { VariantsPage } from './pages/VariantsPage'
import { ComparisonPage } from './pages/ComparisonPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/samples" element={<SamplesPage />} />
        <Route path="/browser/:sampleId" element={<GenomeBrowserPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/variants" element={<VariantsPage />} />
        <Route path="/comparison" element={<ComparisonPage />} />
      </Routes>
    </Layout>
  )
}
