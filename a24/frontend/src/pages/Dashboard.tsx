import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Upload, Users, FileImage, Calendar, Eye, RefreshCw, CheckCircle2
} from 'lucide-react';
import { dicomApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { Patient, Study, Series } from '../types';

const Dashboard: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const loadPatients = async () => {
    setLoading(true);
    try {
      const res = await dicomApi.getPatients(search);
      setPatients(res.data);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, [search]);

  const loadStudies = async (patientId: number) => {
    try {
      const res = await dicomApi.getStudies(patientId);
      setStudies(res.data);
    } catch (e) {
    }
  };

  const loadSeries = async (studyId: number) => {
    try {
      const res = await dicomApi.getSeries(studyId);
      setSeries(res.data);
    } catch (e) {
    }
  };

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedStudy(null);
    setSeries([]);
    loadStudies(patient.id);
  };

  const handleStudySelect = (study: Study) => {
    setSelectedStudy(study);
    loadSeries(study.id);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadMessage('');

    try {
      const res = await dicomApi.upload(Array.from(files));
      setUploadMessage(res.data.message);
      setTimeout(() => {
        setUploadMessage('');
        loadPatients();
      }, 2000);
    } catch (err: any) {
      setUploadMessage('上传失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }

    e.target.value = '';
  };

  const openViewer = (study: Study) => {
    navigate(`/viewer/${study.id}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">患者管理</h1>
            <p className="text-sm text-slate-400">上传、检查和序列管理</p>
          </div>

          {user?.role !== 'doctor' && (
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
              <Upload className="w-5 h-5" />
              <span>上传 DICOM</span>
              <input
                type="file"
                multiple
                accept=".dcm"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          )}
        </div>

        {uploadMessage && (
          <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded bg-slate-800`}>
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {uploadMessage}
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50">
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索患者..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500">
            <Users className="w-4 h-4" />
            <span>{patients.length} 位患者</span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {loading ? (
              <div className="p-4 text-center text-slate-500">加载中...</div>
            ) : patients.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">暂无患者数据</div>
            ) : (
              patients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handlePatientSelect(patient)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedPatient?.id === patient.id
                      ? 'bg-blue-600/20 border border-blue-500/30'
                      : 'hover:bg-slate-800'
                  }`}
                >
                  <div className="font-medium text-white">{patient.name}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>ID: {patient.patient_id}</span>
                    {patient.gender && <span>{patient.gender}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>检查记录</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {studies.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                请选择患者
              </div>
            ) : (
              studies.map((study) => (
                <button
                  key={study.id}
                  onClick={() => handleStudySelect(study)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedStudy?.id === study.id
                      ? 'bg-blue-600/20 border border-blue-500/30'
                      : 'hover:bg-slate-800'
                  }`}
                >
                  <div className="font-medium text-white text-sm">
                    {study.study_description || '未命名检查'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {study.modalities?.map((m) => (
                      <span
                        key={m}
                        className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span>{study.study_date || '未知日期'}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-medium">序列列表</h2>
                <p className="text-sm text-slate-400">
                  {selectedStudy
                    ? `${selectedStudy.study_description || '检查'} - ${series.length} 个序列`
                    : '请选择检查'}
                </p>
              </div>
              {selectedStudy && (
                <button
                  onClick={() => openViewer(selectedStudy)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  查看影像
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {series.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <FileImage className="w-16 h-16 mb-4 opacity-50" />
                <p>请选择检查以查看序列</p>
              </div>
            ) : (
              series.map((s) => (
                <div
                  key={s.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-white">
                        {s.series_description || `序列 ${s.series_number || s.id}`}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-400">
                        <span className="px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded">
                          {s.modality || '未知'}
                        </span>
                        {s.body_part && (
                          <span>{s.body_part}</span>
                        )}
                        {s.instance_count && (
                          <span>{s.instance_count} 层</span>
                        )}
                      </div>
                      {s.rows && s.columns && (
                        <div className="mt-2 text-xs text-slate-500">
                          分辨率: {s.rows}x{s.columns}
                          {s.slice_thickness && ` | 层厚: ${s.slice_thickness}mm`}
                          {s.pixel_spacing && ` | 像素间距: ${s.pixel_spacing.join('x')} mm`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
