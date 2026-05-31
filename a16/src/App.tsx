import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ConnectionManager from './components/ConnectionManager'
import SQLEditor from './components/SQLEditor'
import DataManager from './components/DataManager'
import ChartViewer from './components/ChartViewer'
import QueryHistory from './components/QueryHistory'
import { useAppStore } from './store/appStore'

function App() {
  const { darkMode, loadConnections, loadHistory } = useAppStore()

  useEffect(() => {
    loadConnections()
    loadHistory()
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <div className={`h-full ${darkMode ? 'dark bg-dark-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Layout>
        <Routes>
          <Route path="/" element={<SQLEditor />} />
          <Route path="/connections" element={<ConnectionManager />} />
          <Route path="/data" element={<DataManager />} />
          <Route path="/charts" element={<ChartViewer />} />
          <Route path="/history" element={<QueryHistory />} />
        </Routes>
      </Layout>
    </div>
  )
}

export default App
