import { Link, useNavigate } from 'react-router-dom';
import { Code, GitPullRequest, User, LogOut, Plus } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuthStore';
import { cn } from '@/utils/cn';

interface NavbarProps {
  className?: string;
}

export function Navbar({ className }: NavbarProps) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={cn('bg-white border-b border-gray-200', className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Code className="w-8 h-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">CodeReview</span>
            </Link>
            
            {isAuthenticated && (
              <div className="hidden md:flex items-center ml-10 space-x-4">
                <Link
                  to="/projects"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>Projects</span>
                </Link>
                <Link
                  to="/reviews"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                >
                  <GitPullRequest className="w-4 h-4" />
                  <span>Reviews</span>
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center">
            {isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.display_name}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary-600" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {user?.display_name || user?.username}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
