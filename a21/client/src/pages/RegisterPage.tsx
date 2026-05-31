import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import { useAuthStore } from '../store/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authApi.register({ username, email, password })
      login(response.data.token, response.data.user)
      navigate('/documents')
    } catch (err: any) {
      setError(err.response?.data?.error || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div>
          <h2 className='mt-6 text-center text-3xl font-extrabold text-gray-900'>
            创建账户
        </h2>
          <p className='mt-2 text-center text-sm text-gray-600'>
            加入协同文档系统
        </p>
      </div>
        <form className='mt-8 space-y-6' onSubmit={handleSubmit}>
        {error && (
          <div className='rounded-md bg-red-50 p-4'>
            <p className='text-sm text-red-700'>{error}</p>
          </div>
        )}
        <div className='rounded-md shadow-sm -space-y-px'>
          <div>
            <label htmlFor='username' className='sr-only'>用户名</label>
            <input
              id='username'
              name='username'
              type='text'
              autoComplete='username'
              required
              className='appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm'
              placeholder='用户名'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor='email' className='sr-only'>邮箱地址</label>
            <input
              id='email'
              name='email'
              type='email'
              autoComplete='email'
              required
              className='appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm'
              placeholder='邮箱地址'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor='password' className='sr-only'>密码</label>
            <input
              id='password'
              name='password'
              type='password'
              autoComplete='new-password'
              required
              className='appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm'
              placeholder='密码'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div>
          <button
            type='submit'
            disabled={loading}
            className='group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50'
          >
            {loading ? '注册中...' : '注册'}
          </button>
        </div>
      </form>
      <p className='mt-2 text-center text-sm text-gray-600'>
        已有账户？{' '}
        <Link to='/login' className='font-medium text-blue-600 hover:text-blue-500'>
          立即登录
        </Link>
      </p>
    </div>
    </div>
  )
}
