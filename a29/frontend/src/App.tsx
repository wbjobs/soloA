import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { SimulationCreate } from './pages/SimulationCreate'
import { SimulationDetail } from './pages/SimulationDetail'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<SimulationCreate />} />
        <Route path="/simulation/:id" element={<SimulationDetail />} />
      </Routes>
    </Layout>
  )
}

export default App
