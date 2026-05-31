import { cn } from '@/utils/cn';

interface StatusBadgeProps {
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  size?: 'sm' | 'md';
}

const statusConfig = {
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-100 text-green-800 border-green-200'
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800 border-red-200'
  },
  merged: {
    label: 'Merged',
    className: 'bg-purple-100 text-purple-800 border-purple-200'
  }
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        config.className,
        sizeClasses
      )}
    >
      {config.label}
    </span>
  );
}
