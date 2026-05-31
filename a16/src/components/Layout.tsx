import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', label: 'SQL编辑器', icon: '📝' },
  { path: '/data', label: '数据管理', icon: '📊' },
  { path: '/charts', label: '数据可视化', icon: '📈' },
  { path: '/history', label: '查询历史', icon: '🕐' },
]

export default function Layout({ children }: LayoutProps) {
  const { connections, activeConnectionId, setActiveConnection, darkMode, toggleDarkMode } = useAppStore()
  const navigate = useNavigate()

  const activeConnection = connections.find(c => c.id === activeConnectionId)

  return (
    <div className="h-full flex flex-col">
      <header className="h-12 bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2 font-bold text-lg">
          <span>📊</span>
          <span>DataVisualizer</span>
        </div>

        <nav className="flex-1 flex items-center gap-1 ml-8">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300'
                }`
              }
            >
              <span className="mr-1">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <select
            value={activeConnectionId || ''}
            onChange={(e) => setActiveConnection(e.target.value || null)}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">选择数据库连接</option>
            {connections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.type})
              </option>
            ))}
          </select>

          {activeConnection && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              📍 {activeConnection.database || activeConnection.filePath}
            </span>
          )}

          <button
            onClick={() => navigate('/connections')}
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm transition-colors"
          >
            ⚙️ 连接管理
          </button>

          <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
