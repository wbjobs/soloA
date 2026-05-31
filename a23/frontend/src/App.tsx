import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DatabaseOutlined,
  ProjectOutlined,
  HistoryOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { datasourceApi, flowApi } from './api';
import { useAppStore } from './store';
import DatasourcesPage from './pages/DatasourcesPage';
import FlowsPage from './pages/FlowsPage';
import FlowEditorPage from './pages/FlowEditorPage';
import ExecutionsPage from './pages/ExecutionsPage';
import ExecutionDetailPage from './pages/ExecutionDetailPage';
import LineagePage from './pages/LineagePage';

const { Header, Sider, Content } = Layout;

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setDatasources, setFlows } = useAppStore();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [datasources, flows] = await Promise.all([
          datasourceApi.getAll(),
          flowApi.getAll(),
        ]);
        setDatasources(datasources);
        setFlows(flows);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };
    loadData();
  }, [setDatasources, setFlows]);

  const menuItems = [
    {
      key: '/datasources',
      icon: <DatabaseOutlined />,
      label: '数据源管理',
    },
    {
      key: '/flows',
      icon: <ProjectOutlined />,
      label: '流程设计',
    },
    {
      key: '/executions',
      icon: <HistoryOutlined />,
      label: '执行记录',
    },
    {
      key: '/lineage',
      icon: <ShareAltOutlined />,
      label: '数据血缘',
    },
  ];

  const getSelectedKey = () => {
    if (location.pathname.startsWith('/flows/editor')) {
      return '/flows';
    }
    if (location.pathname.startsWith('/executions/')) {
      return '/executions';
    }
    return location.pathname;
  };

  return (
    <Layout className="app-layout">
      <Header style={{ background: '#001529', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
        <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginRight: '48px' }}>
          ETL 数据集成平台
        </div>
      </Header>
      <Layout>
        <Sider width={200} className="sider-menu">
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Content style={{ background: '#f5f5f5', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/flows" replace />} />
            <Route path="/datasources" element={<DatasourcesPage />} />
            <Route path="/flows" element={<FlowsPage />} />
            <Route path="/flows/editor/:flowId" element={<FlowEditorPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
            <Route path="/executions/:executionId" element={<ExecutionDetailPage />} />
            <Route path="/lineage" element={<LineagePage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
