import React from 'react';
import { User, Permission } from '../types';

interface ParticipantListProps {
  participants: User[];
  currentUser: User | null;
  onSetPermission: (userId: string, permission: 'write' | 'read') => void;
}

const permissionLabels: Record<Permission, string> = {
  owner: 'Owner',
  write: 'Write',
  read: 'Read',
};

const permissionColors: Record<Permission, string> = {
  owner: '#FFD700',
  write: '#55FF55',
  read: '#888888',
};

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  currentUser,
  onSetPermission,
}) => {
  const isOwner = currentUser?.permission === 'owner';

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#16213e',
        borderRadius: '8px',
        color: '#eaeaea',
      }}
    >
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
        Participants ({participants.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {participants.map((user) => (
          <div
            key={user.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              backgroundColor: '#1a1a2e',
              borderRadius: '6px',
              border:
                user.id === currentUser?.id ? '1px solid #4a4a6a' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: user.color,
                }}
              />
              <span style={{ fontWeight: '500' }}>
                {user.name}
                {user.id === currentUser?.id && ' (you)'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '12px',
                  color: permissionColors[user.permission],
                  fontWeight: '600',
                }}
              >
                {permissionLabels[user.permission]}
              </span>

              {isOwner && user.id !== currentUser?.id && user.permission !== 'owner' && (
                <select
                  value={user.permission}
                  onChange={(e) =>
                    onSetPermission(user.id, e.target.value as 'write' | 'read')
                  }
                  style={{
                    fontSize: '12px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#0f3460',
                    color: '#eaeaea',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
