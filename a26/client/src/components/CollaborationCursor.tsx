import { Collaborator } from '../types';

interface CollaborationCursorProps {
  collaborators: Collaborator[];
  isConnected: boolean;
  currentUser?: {
    username: string;
    color?: string;
  };
}

export function CollaborationCursor({
  collaborators,
  isConnected,
  currentUser
}: CollaborationCursorProps) {
  return (
    <div 
      className="collaboration-panel"
      style={{
        padding: '12px',
        background: '#fafafa',
        borderBottom: '1px solid #e0e0e0'
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <h4 style={{ margin: 0, fontSize: '14px', color: '#333' }}>在线协作者</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: isConnected ? '#4caf50' : '#f44336',
            display: 'inline-block'
          }} />
          <span style={{ fontSize: '12px', color: '#666' }}>
            {isConnected ? '已连接' : '未连接'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {currentUser && (
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#e3f2fd',
              borderRadius: '20px',
              border: '1px solid #bbdefb'
            }}
          >
            <span 
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: currentUser.color || '#4285f4',
                boxShadow: '0 0 0 2px rgba(66, 133, 244, 0.3)'
              }} 
            />
            <span style={{ fontSize: '13px', color: '#1976d2' }}>
              {currentUser.username} (你)
            </span>
          </div>
        )}

        {collaborators.map((collab) => (
          <div 
            key={collab.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#fff',
              borderRadius: '20px',
              border: `1px solid ${collab.color}40`
            }}
          >
            <span 
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: collab.color
              }} 
            />
            <span style={{ fontSize: '13px', color: '#333' }}>
              {collab.username}
            </span>
            <span style={{ fontSize: '11px', color: '#999' }}>
              位置 {collab.position}
            </span>
          </div>
        ))}

        {collaborators.length === 0 && (!currentUser || currentUser.username === '') && (
          <span style={{ fontSize: '12px', color: '#999', padding: '4px 0' }}>
            暂无其他协作者
          </span>
        )}
      </div>
    </div>
  );
}
