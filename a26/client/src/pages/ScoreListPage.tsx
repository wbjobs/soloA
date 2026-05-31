import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoreApi, authApi } from '../services/api';

interface ScoreListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function ScoreListPage() {
  const navigate = useNavigate();
  const [scores, setScores] = useState<ScoreListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; username: string } | null>(null);

  useEffect(() => {
    checkAuth();
    loadScores();
  }, []);

  const checkAuth = async () => {
    try {
      const result = await authApi.getMe();
      setUser(result.user);
    } catch {
      navigate('/login');
    }
  };

  const loadScores = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await scoreApi.list();
      setScores(result.scores as ScoreListItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载乐谱列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await scoreApi.create('未命名乐谱');
      navigate(`/scores/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建乐谱失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, scoreId: string) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个乐谱吗？')) return;
    
    try {
      await scoreApi.delete(scoreId);
      loadScores();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleLogout = () => {
    authApi.logout();
    navigate('/login');
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e0e0e0',
        padding: '0 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px'
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', color: '#333' }}>
          🎵 在线乐谱编辑器
        </h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              {user.username}
            </span>
          )}
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#666'
            }}
          >
            退出登录
          </button>
        </div>
      </div>

      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: '#333' }}>
            我的乐谱
          </h2>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: '12px 24px',
              background: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: creating ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: creating ? 0.7 : 1
            }}
          >
            {creating ? '创建中...' : '+ 新建乐谱'}
          </button>
        </div>

        {error && (
          <div style={{
            padding: '16px',
            background: '#ffebee',
            color: '#c62828',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            {error}
            <button
              onClick={loadScores}
              style={{
                marginLeft: '16px',
                padding: '4px 12px',
                background: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              重试
            </button>
          </div>
        )}

        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '80px',
            color: '#999'
          }}>
            加载中...
          </div>
        ) : scores.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 40px',
            background: 'white',
            borderRadius: '12px',
            border: '2px dashed #e0e0e0'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎼</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>
              暂无乐谱
            </h3>
            <p style={{ color: '#999', margin: 0 }}>
              点击上方按钮创建第一个乐谱
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {scores.map((score) => (
              <div
                key={score.id}
                onClick={() => navigate(`/scores/${score.id}`)}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e0e0e0',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎵</div>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '16px', 
                    color: '#333',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {score.title}
                  </h3>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    {formatDate(score.updatedAt)}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, score.id)}
                    style={{
                      padding: '4px 12px',
                      background: '#ffebee',
                      color: '#c62828',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
