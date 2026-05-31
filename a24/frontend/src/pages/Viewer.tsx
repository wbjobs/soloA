import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Brain, FileText, Save, CheckCircle, RefreshCw, AlertCircle, X, Loader2,
  Mic, BookTemplate, Target, Layers
} from 'lucide-react';
import { dicomApi, reportApi, templateApi } from '../services/api';
import ImageViewer from '../components/ImageViewer';
import VolumeViewer from '../components/VolumeViewer';
import AnnotationPanel from '../components/AnnotationPanel';
import VoiceInput from '../components/VoiceInput';
import type { Series, Instance, AIFinding, TaskStatus, Report, Annotation, ReportTemplate } from '../types';

const INSTANCE_PAGE_SIZE = 50;

const Viewer: React.FC = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [instancesMap, setInstancesMap] = useState<Record<number, Instance[]>>({});
  const [instancesTotalMap, setInstancesTotalMap] = useState<Record<number, number>>({});
  const [instancesLoadedMap, setInstancesLoadedMap] = useState<Record<number, boolean>>({});
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [totalInstances, setTotalInstances] = useState(0);
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  const [aiTask, setAiTask] = useState<TaskStatus | null>(null);
  const [aiFindings, setAiFindings] = useState<AIFinding[]>([]);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportData, setReportData] = useState({
    findings: '',
    impression: '',
    recommendations: '',
    follow_up: '',
    is_final: false,
  });
  const [showReport, setShowReport] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [crosshairSlice, setCrosshairSlice] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<'findings' | 'impression' | 'recommendations' | null>(null);
  const isLoadingRef = useRef(false);

  const loadSeries = useCallback(async () => {
    if (!studyId) return;
    try {
      const res = await dicomApi.getSeries(Number(studyId));
      const seriesData = res.data;
      setSeriesList(seriesData);
      if (seriesData.length > 0) {
        handleSeriesSelect(seriesData[0]);
      }
    } catch (e) {
      console.error('Failed to load series:', e);
    }
  }, [studyId]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await templateApi.list(selectedSeries?.modality || undefined);
      setTemplates(res.data);
    } catch (e) {
      console.error('Failed to load templates:', e);
    }
  }, [selectedSeries?.modality]);

  useEffect(() => {
    loadSeries();
    loadReport();
    loadTemplates();
  }, [loadSeries, loadTemplates]);

  const loadInstancesPage = useCallback(async (seriesId: number, skip: number = 0) => {
    if (isLoadingRef.current) return null;
    isLoadingRef.current = true;
    setIsLoadingInstances(true);

    try {
      const res = await dicomApi.getInstances(seriesId, skip, INSTANCE_PAGE_SIZE);
      const { total, data } = res.data;

      setInstancesTotalMap((prev) => ({ ...prev, [seriesId]: total }));
      setInstancesMap((prev) => {
        const existing = prev[seriesId] || [];
        const merged = [...existing];
        data.forEach((inst: Instance, idx: number) => {
          const pos = skip + idx;
          if (pos < merged.length) {
            merged[pos] = inst;
          } else {
            merged.push(inst);
          }
        });
        return { ...prev, [seriesId]: merged };
      });

      if (skip + INSTANCE_PAGE_SIZE >= total) {
        setInstancesLoadedMap((prev) => ({ ...prev, [seriesId]: true }));
      }

      return { total, data };
    } catch (e) {
      console.error('Failed to load instances:', e);
      return null;
    } finally {
      isLoadingRef.current = false;
      setIsLoadingInstances(false);
    }
  }, []);

  const loadMoreInstances = useCallback(async () => {
    if (!selectedSeries) return;
    const seriesId = selectedSeries.id;
    const loaded = instancesMap[seriesId]?.length || 0;
    const total = instancesTotalMap[seriesId] || 0;

    if (loaded < total && !isLoadingRef.current) {
      await loadInstancesPage(seriesId, loaded);
      const updatedInstances = instancesMap[seriesId] || [];
      setInstances(updatedInstances);
    }
  }, [selectedSeries, instancesMap, instancesTotalMap, loadInstancesPage]);

  const handleSeriesSelect = async (series: Series) => {
    setSelectedSeries(series);
    const seriesId = series.id;

    if (instancesMap[seriesId] && instancesMap[seriesId].length > 0) {
      setInstances(instancesMap[seriesId]);
      setTotalInstances(instancesTotalMap[seriesId] || instancesMap[seriesId].length);
      return;
    }

    const result = await loadInstancesPage(seriesId, 0);
    if (result) {
      setInstances(result.data);
      setTotalInstances(result.total);
    }
  };

  const loadReport = async () => {
    if (!studyId) return;
    try {
      const res = await reportApi.get(Number(studyId));
      if (res.data) {
        setReport(res.data);
        setReportData({
          findings: res.data.findings || '',
          impression: res.data.impression || '',
          recommendations: res.data.recommendations || '',
          follow_up: res.data.follow_up || '',
          is_final: res.data.is_final || false,
        });
      }
    } catch (e) {
      console.error('Failed to load report:', e);
    }
  };

  const runAIDetection = async () => {
    if (!selectedSeries) return;
    setAiProcessing(true);
    try {
      const res = await dicomApi.runAIDetection(selectedSeries.id);
      setAiTask(res.data);
      pollAIStatus(res.data.task_id);
    } catch (e) {
      console.error('AI detection failed:', e);
      setAiProcessing(false);
    }
  };

  const pollAIStatus = async (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await dicomApi.getAIDetectionStatus(taskId);
        setAiTask(res.data);
        if (res.data.status === 'completed' && res.data.results) {
          setAiFindings(res.data.results.findings);
          setAiProcessing(false);
          clearInterval(interval);
        } else if (res.data.status === 'failed') {
          setAiProcessing(false);
          clearInterval(interval);
        }
      } catch (e) {
        console.error('Failed to poll AI status:', e);
        setAiProcessing(false);
        clearInterval(interval);
      }
    }, 2000);
  };

  const applyTemplate = (template: ReportTemplate) => {
    setReportData({
      ...reportData,
      findings: template.findings_template || reportData.findings,
      impression: template.impression_template || reportData.impression,
      recommendations: template.recommendations_template || reportData.recommendations,
    });
    setShowTemplates(false);
  };

  const handleVoiceTranscript = (text: string) => {
    if (activeVoiceField) {
      setReportData({
        ...reportData,
        [activeVoiceField]: text,
      });
    }
  };

  const saveReport = async (finalize: boolean = false) => {
    if (!studyId) return;
    setSavingReport(true);
    try {
      await reportApi.save(Number(studyId), {
        ...reportData,
        is_final: finalize,
      });
      loadReport();
      if (finalize) {
        setShowReport(false);
      }
    } catch (e) {
      console.error('Failed to save report:', e);
    } finally {
      setSavingReport(false);
    }
  };

  const highConfidenceCount = aiFindings.filter((f) => f.confidence >= 0.9).length;

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              返回
            </button>
            <div className="w-px h-6 bg-slate-700" />
            <div>
              <h1 className="text-white font-medium">影像查看器</h1>
              <p className="text-xs text-slate-500">检查 #{studyId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showVolume
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              3D/MIP
            </button>

            <button
              onClick={() => setShowAnnotations(!showAnnotations)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showAnnotations
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <Target className="w-4 h-4" />
              标注
              {annotations.length > 0 && (
                <span className="text-xs bg-white/20 px-1.5 rounded">
                  {annotations.length}
                </span>
              )}
            </button>

            <button
              onClick={runAIDetection}
              disabled={!selectedSeries || aiProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {aiProcessing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              AI 检测
            </button>

            <button
              onClick={() => setShowReport(!showReport)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              诊断报告
            </button>
          </div>
        </div>
      </header>

      {aiFindings.length > 0 && (
        <div className="flex items-center gap-4 px-6 py-2 bg-purple-900/30 border-b border-purple-800/30">
          <div className="flex items-center gap-1 text-purple-300">
            <CheckCircle className="w-4 h-4" />
            检测完成
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            共发现 {aiFindings.length} 个病灶
          </div>
          <div className="flex items-center gap-1 text-red-400">
            <AlertCircle className="w-4 h-4" />
            高置信度 {highConfidenceCount} 个
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <h3 className="text-sm font-medium text-slate-400">序列列表</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {seriesList.map((series) => (
              <button
                key={series.id}
                onClick={() => handleSeriesSelect(series)}
                className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                  selectedSeries?.id === series.id
                    ? 'bg-blue-600/20 border border-blue-500/30'
                    : 'hover:bg-slate-800'
                }`}
              >
                <div className="text-white font-medium">
                  {series.series_description || `序列 ${series.series_number}`}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {series.modality} | {series.instance_count} 层
                </div>
              </button>
            ))}
          </div>

          {aiFindings.length > 0 && (
            <div className="p-3 border-t border-slate-800">
              <h3 className="text-sm font-medium text-slate-400 mb-2">
                AI 检测结果
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {aiFindings.map((finding, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCrosshairSlice(finding.slice_index)}
                    className="w-full text-left p-2 rounded text-xs bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-slate-300">
                        层 {finding.slice_index + 1}
                      </div>
                      <div
                        className={`text-xs ${
                          finding.severity === 'high'
                            ? 'text-red-400'
                            : finding.severity === 'medium'
                            ? 'text-yellow-400'
                            : 'text-blue-400'
                        }`}
                      >
                        {(finding.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {isLoadingInstances && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20 pointer-events-none">
              <div className="flex items-center gap-2 text-white bg-slate-800 px-4 py-2 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载切片数据...
              </div>
            </div>
          )}

          {selectedSeries && instances.length > 0 ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <ImageViewer
                series={selectedSeries}
                instances={instances}
                totalInstances={totalInstances}
                loadMoreInstances={loadMoreInstances}
                aiFindings={aiFindings}
                onSliceChange={setCrosshairSlice}
              />

              {showVolume && selectedSeries && (
                <VolumeViewer
                  series={selectedSeries}
                  windowCenter={selectedSeries.window_center || -600}
                  windowWidth={selectedSeries.window_width || 1500}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-black">
              {isLoadingInstances ? (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  加载中...
                </div>
              ) : (
                <div className="text-slate-500">请选择序列</div>
              )}
            </div>
          )}
        </div>

        {showReport && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-medium text-white">诊断报告</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
                  title="报告模板"
                >
                  <BookTemplate className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowReport(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showTemplates && templates.length > 0 && (
              <div className="p-3 border-b border-slate-800 bg-slate-800/30">
                <div className="text-xs text-slate-400 mb-2">选择报告模板</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => applyTemplate(template)}
                      className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 rounded transition-colors"
                    >
                      {template.name}
                      {template.is_default && (
                        <span className="ml-1 text-blue-400">[默认]</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-400">
                    影像发现 (Findings)
                  </label>
                  <button
                    onClick={() => setActiveVoiceField(activeVoiceField === 'findings' ? null : 'findings')}
                    className={`p-1 rounded transition-colors ${
                      activeVoiceField === 'findings'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-500 hover:text-white'
                    }`}
                    disabled={report?.is_final}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                {activeVoiceField === 'findings' && (
                  <VoiceInput
                    onTranscript={handleVoiceTranscript}
                    disabled={report?.is_final}
                    placeholder="说出影像发现内容..."
                  />
                )}
                <textarea
                  value={reportData.findings}
                  onChange={(e) => setReportData({ ...reportData, findings: e.target.value })}
                  disabled={report?.is_final}
                  rows={6}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="描述影像发现..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-400">
                    诊断印象 (Impression)
                  </label>
                  <button
                    onClick={() => setActiveVoiceField(activeVoiceField === 'impression' ? null : 'impression')}
                    className={`p-1 rounded transition-colors ${
                      activeVoiceField === 'impression'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-500 hover:text-white'
                    }`}
                    disabled={report?.is_final}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                {activeVoiceField === 'impression' && (
                  <VoiceInput
                    onTranscript={handleVoiceTranscript}
                    disabled={report?.is_final}
                    placeholder="说出诊断印象..."
                  />
                )}
                <textarea
                  value={reportData.impression}
                  onChange={(e) => setReportData({ ...reportData, impression: e.target.value })}
                  disabled={report?.is_final}
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="诊断印象..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-400">
                    治疗建议
                  </label>
                  <button
                    onClick={() => setActiveVoiceField(activeVoiceField === 'recommendations' ? null : 'recommendations')}
                    className={`p-1 rounded transition-colors ${
                      activeVoiceField === 'recommendations'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-500 hover:text-white'
                    }`}
                    disabled={report?.is_final}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                {activeVoiceField === 'recommendations' && (
                  <VoiceInput
                    onTranscript={handleVoiceTranscript}
                    disabled={report?.is_final}
                    placeholder="说出治疗建议..."
                  />
                )}
                <textarea
                  value={reportData.recommendations}
                  onChange={(e) => setReportData({ ...reportData, recommendations: e.target.value })}
                  disabled={report?.is_final}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="治疗建议..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  随访建议
                </label>
                <input
                  type="text"
                  value={reportData.follow_up}
                  onChange={(e) => setReportData({ ...reportData, follow_up: e.target.value })}
                  disabled={report?.is_final}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="如：3个月后复查"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 space-y-2">
              {report?.is_final ? (
                <div className="flex items-center gap-2 text-sm text-yellow-500 bg-yellow-500/10 px-3 py-2 rounded">
                  <CheckCircle className="w-4 h-4" />
                  报告已终结，无法修改
                </div>
              ) : (
                <>
                  <button
                    onClick={() => saveReport(false)}
                    disabled={savingReport}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    保存草稿
                  </button>
                  <button
                    onClick={() => saveReport(true)}
                    disabled={savingReport}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    终结报告
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {showAnnotations && selectedSeries && (
          <AnnotationPanel
            series={selectedSeries}
            instances={instances}
            currentIndex={crosshairSlice}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
          />
        )}
      </div>
    </div>
  );
};

export default Viewer;
