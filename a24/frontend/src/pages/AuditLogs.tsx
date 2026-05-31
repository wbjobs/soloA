import React, { useState, useEffect } from 'react';
import { ClipboardList, User, Clock, Search, Filter } from 'lucide-react';
import { auditApi } from '../services/api';
import type { AuditLog } from '../types';

const actionLabels: Record<string, string> = {
  view: '查看',
  upload: '上传',
  delete: '删除',
  download: '下载',
  edit_report: '编辑报告',
  ai_detection: 'AI 检测',
  login: '登录',
  logout: '登出',
};

const actionColors: Record<string, string> = {
  view: 'text-blue-400',
  upload: 'text-green-400',
  delete: 'text-red-400',
  download: 'text-cyan-400',
  edit_report: 'text-yellow-400',
  ai_detection: 'text-purple-400',
  login: 'text-emerald-400',
  logout: 'text-slate-400',
};

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>('');

  useEffect(() => {
    loadLogs();
  }, [actionFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await auditApi.getLogs({ action: actionFilter || undefined });
      setLogs(res.data);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">审计日志</h1>
            <p className="text-sm text-slate-400">系统访问行为记录</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">全部操作</option>
                {Object.entries(actionLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-500">加载中...</div>
          </div>
        ) : (
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                    时间
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                    用户
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                    操作
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                    资源
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                    详情
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                    IP 地址
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      暂无日志记录
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Clock className="w-4 h-4 text-slate-500" />
                          {new Date(log.timestamp).toLocaleString('zh-CN')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <span className="text-sm text-slate-300">
                            {log.user_id || '未知用户'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${actionColors[log.action] || 'text-slate-300'}`}>
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-400">
                          {log.resource_type || '-'}
                          {log.resource_id && `: ${log.resource_id}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-500 text-xs max-w-xs truncate block">
                          {log.details ? JSON.stringify(log.details) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-500 font-mono">
                          {log.ip_address || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
