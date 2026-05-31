import React from 'react';
import { Layout, Menu, theme } from 'antd';
import {
  DashboardOutlined,
  LineChartOutlined,
  WarningOutlined,
  ShareAltOutlined,
  UploadOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TimeSeriesChart from './pages/TimeSeriesChart';
import Alerts from './pages/Alerts';
import AssociationRules from './pages/AssociationRules';
import DataUpload from './pages/DataUpload';

const { Header, Sider, Content } = Layout;

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/timeseries',
      icon: <LineChartOutlined />,
      label: '时序分析',
    },
    {
      key: '/alerts',
      icon: <WarningOutlined />,
      label: '告警管理',
    },
    {
      key: '/rules',
      icon: <ShareAltOutlined />,
      label: '关联规则',
    },
    {
      key: '/upload',
      icon: <UploadOutlined />,
      label: '数据导入',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible>
        <div style={{ 
          height: 64, 
          margin: 16, 
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 16,
          fontWeight: 'bold'
        }}>
          IoT Analytics
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ margin: 0 }}>工业物联网数据分析平台</h2>
          <SettingOutlined style={{ fontSize: 20, cursor: 'pointer' }} />
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/timeseries" element={<TimeSeriesChart />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/rules" element={<AssociationRules />} />
            <Route path="/upload" element={<DataUpload />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
