import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, FileImage, ClipboardList, LogOut, User, 
  Shield, Activity, Upload 
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
    } finally {
      logout();
      navigate('/login');
    }
  };

  const navItems = [
    { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
    { path: '/audit', label: '审计日志', icon: ClipboardList, roles: ['admin'] },
  ];

  const roleLabel = {
    admin: '管理员',
    doctor: '医生',
    technician: '技师',
  }[user?.role || 'doctor'];

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">PACS 系统</h1>
              <p className="text-xs text-slate-500">医学影像管理</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems
            .filter((item) => !item.roles || (user && item.roles.includes(user.role)))
            .map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith(path)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg mb-3">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
              <User className="w-5 h-5 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export default Layout;
