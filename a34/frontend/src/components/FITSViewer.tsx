import { useState, useRef } from 'react';
import { Upload, FileImage, Info, Eye } from 'lucide-react';
import { useAppStore } from '../store';
import type { FITSMetadata } from '../types';

export default function FITSViewer() {
  const { fitsFiles, addFitsFile, currentFits, setCurrentFits } = useAppStore();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/fits/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '上传失败');
      }

      const data = await response.json();
      addFitsFile({
        id: data.file_id,
        name: data.original_name,
        metadata: data.metadata
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatValue = (value: any) => {
    if (value === undefined || value === null) return '-';
    if (typeof value === 'number') {
      if (value % 1 !== 0) return value.toFixed(4);
      return value.toString();
    }
    return value;
  };

  return (
    <div className="h-full flex flex-col bg-space-950">
      <div className="p-4 border-b border-space-700">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileImage size={20} className="text-purple-400" />
          FITS 文件管理
        </h2>

        <div
          className="border-2 border-dashed border-space-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".fits,.fit,.fits.gz"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="mx-auto text-gray-400 mb-2" size={32} />
          <p className="text-gray-300 text-sm">
            {isUploading ? '上传中...' : '点击或拖拽上传 FITS 文件'}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            支持 .fits, .fit, .fits.gz 格式
          </p>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r border-space-700 overflow-y-auto">
          <div className="p-3">
            <h3 className="text-sm font-medium text-gray-400 mb-2">已上传文件</h3>
            {fitsFiles.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">暂无文件</p>
            ) : (
              <div className="space-y-2">
                {fitsFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => setCurrentFits(file)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      currentFits?.id === file.id
                        ? 'bg-space-700 border border-purple-500'
                        : 'bg-space-800 hover:bg-space-700 border border-transparent'
                    }`}
                  >
                    <p className="text-white text-sm font-medium truncate">
                      {file.name}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      {file.metadata.naxis1} × {file.metadata.naxis2 || '-'}
                      {file.metadata.filter ? ` | ${file.metadata.filter}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {currentFits ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-purple-400" />
                <h3 className="text-lg font-medium text-white">
                  {currentFits.name}
                </h3>
              </div>

              <div className="bg-space-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
                  <Info size={14} />
                  基本信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="对象名称" value={currentFits.metadata.object_name} />
                  <InfoRow label="数据类型" value={currentFits.metadata.bitpix} />
                  <InfoRow label="图像尺寸" value={`${currentFits.metadata.naxis1} × ${currentFits.metadata.naxis2}`} />
                  <InfoRow label="NAXIS" value={currentFits.metadata.naxis} />
                  <InfoRow 
                    label="赤经 (RA)" 
                    value={currentFits.metadata.ra?.toFixed(6)} 
                  />
                  <InfoRow 
                    label="赤纬 (Dec)" 
                    value={currentFits.metadata.dec?.toFixed(6)} 
                  />
                  <InfoRow 
                    label="观测时间" 
                    value={currentFits.metadata.date_obs} 
                  />
                  <InfoRow 
                    label="曝光时间" 
                    value={currentFits.metadata.exposure_time ? `${currentFits.metadata.exposure_time}s` : undefined} 
                  />
                  <InfoRow label="望远镜" value={currentFits.metadata.telescope} />
                  <InfoRow label="仪器" value={currentFits.metadata.instrument} />
                  <InfoRow label="滤光片" value={currentFits.metadata.filter} />
                </div>
              </div>

              <div className="bg-space-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-4">
                  其他头信息
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="text-left py-2 pr-4">关键字</th>
                        <th className="text-left py-2 pr-4">值</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {Object.entries(currentFits.metadata.additional_headers).map(([key, value]) => (
                        <tr key={key} className="border-t border-space-700">
                          <td className="py-2 pr-4 font-mono text-xs text-purple-400">
                            {key}
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">
                            {formatValue(value)}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(currentFits.metadata.additional_headers).length === 0 && (
                        <tr>
                          <td colSpan={2} className="py-4 text-center text-gray-600">
                            无额外头信息
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FileImage size={48} className="mx-auto mb-4 opacity-30" />
                <p>选择一个 FITS 文件查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-white text-sm font-mono">
        {value !== undefined ? value : '-'}
      </p>
    </div>
  );
}
