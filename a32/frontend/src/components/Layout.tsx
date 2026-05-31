import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  Database,
  Dna,
  Activity,
  Menu,
  X,
  GitCompare,
  Dna as DnaIcon,
} from 'lucide-react'
import { useState } from 'react'

interface LayoutProps {
  children: ReactNode
}

interface NavItem {
  path: string
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <Home size={20} /> },
  { path: '/samples', label: 'Samples', icon: <Database size={20} /> },
  { path: '/tasks', label: 'Tasks', icon: <Activity size={20} /> },
  { path: '/variants', label: 'Variants', icon: <Dna size={20} /> },
  { path: '/comparison', label: 'Comparison', icon: <GitCompare size={20} /> },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-genomic-600 rounded-lg flex items-center justify-center">
              <DnaIcon className="text-white" size={24} />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-gray-800">GenomeViz</h1>
                <p className="text-xs text-gray-500">Bioinformatics Platform</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-genomic-50 text-genomic-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {sidebarOpen && (
          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 space-y-1">
              <p>Reference: hg38</p>
              <p>v1.0.0</p>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
