import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Waves, Plus, List, Activity } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Activity },
    { path: '/create', label: 'New Simulation', icon: Plus },
  ]

  return (
    <div className="min-h-screen bg-seismic-dark flex">
      <aside className="w-64 bg-seismic-card border-r border-seismic-border flex flex-col">
        <div className="p-6 border-b border-seismic-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Waves className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SeismicSim</h1>
              <p className="text-xs text-gray-400">Wave Simulation</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-300 hover:bg-seismic-border hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-seismic-border">
          <div className="text-xs text-gray-500 text-center">
            Seismic Wave Simulation v1.0
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="h-16 bg-seismic-card border-b border-seismic-border px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <List className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">
              {location.pathname === '/' && 'Dashboard'}
              {location.pathname === '/create' && 'New Simulation'}
              {location.pathname.startsWith('/simulation') && 'Simulation Details'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-400">System Online</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  )
}
