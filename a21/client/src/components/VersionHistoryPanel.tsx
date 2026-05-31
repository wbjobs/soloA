import { DocumentVersion } from '../types'
import { documentApi } from '../api'

interface VersionHistoryPanelProps {
  versions: DocumentVersion[]
  documentId: string
  onRollback: () => void
}

export default function VersionHistoryPanel({
  versions,
  documentId,
  onRollback
}: VersionHistoryPanelProps) {
  const handleRollback = async (versionNumber: number) => {
    if (confirm(`确定要回滚到版本 ${versionNumber} 吗？这将覆盖当前文档内容。`)) {
      try {
        await documentApi.rollbackVersion(documentId, versionNumber)
        onRollback()
      } catch (error) {
        console.error('回滚版本失败:', error)
      }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  return (
    <div className='w-80 bg-white rounded-lg shadow flex flex-col h-full'>
      <div className='p-4 border-b border-gray-200'>
        <h3 className='font-semibold text-gray-900'>版本历史 ({versions.length})</h3>
        <p className='text-sm text-gray-500 mt-1'>最多保存50个版本快照</p>
      </div>

      <div className='flex-1 overflow-y-auto p-4 space-y-3'>
        {versions.length === 0 ? (
          <div className='text-center text-gray-500 py-8'>
            还没有版本快照
            <p className='text-sm mt-2'>点击"创建快照"保存当前文档状态</p>
          </div>
        ) : (
          versions.map(version => (
            <div
              key={version.id}
              className='p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors'
            >
              <div className='flex items-center justify-between mb-1'>
                <span className='font-medium text-gray-900'>
                  版本 {version.versionNumber}
                </span>
                <button
                  onClick={() => handleRollback(version.versionNumber)}
                  className='text-xs text-blue-600 hover:text-blue-800'
                >
                  回滚
                </button>
              </div>
              <div className='text-xs text-gray-500 mb-1'>
                由 {version.createdByName} 创建
              </div>
              <div className='text-xs text-gray-400'>
                {formatDate(version.createdAt)}
              </div>
              <div className='mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 line-clamp-3'>
                {version.contentSnapshot || '(无文本内容)'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
