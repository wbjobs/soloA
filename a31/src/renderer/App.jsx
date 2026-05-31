import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, notification, Badge } from 'antd';
import { DashboardOutlined, WarningOutlined, LineChartOutlined, DatabaseOutlined, SettingOutlined } from '@ant-design/icons';
import Dashboard from './components/Dashboard';
import AlarmPanel from './components/AlarmPanel';
import { ipcRenderer } from 'electron';

const { Header, Sider, Content } = Layout;

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unackedAlarms, setUnackedAlarms] = useState(0);
  const [realtimeData, setRealtimeData] = useState({});

  useEffect(() => {
    ipcRenderer.on('realtime-data-update', (event, data) => {
      setRealtimeData(data);
    });

    ipcRenderer.on('alarm-triggered', (event, alarm) => {
      if (!alarm.acknowledged) {
        setUnackedAlarms(prev => prev + 1);
        
        notification.open({
          message: `⚠️ 报警 (${alarm.level})`,
          description: alarm.message,
          duration: 5,
          type: alarm.level === 'high' ? 'error' : 'warning'
        });
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('realtime-data-update');
      ipcRenderer.removeAllListeners('alarm-triggered');
    };
  }, []);

  const handleMenuClick = (e) => {
    setActiveTab(e.key);
    if (e.key === 'alarm') {
      setUnackedAlarms(0);
    }
  };

  const menuItems = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '实时仪表盘' },
    { 
      key: 'alarm', 
      icon: <WarningOutlined />, 
      label: <Badge count={unackedAlarms} overflowCount={99}><span>报警管理</span></Badge>
    },
    { key: 'history', icon: <LineChartOutlined />, label: '历史趋势' },
    { key: 'data', icon: <DatabaseOutlined />, label: '数据查询' },
    { key: 'setting', icon: <SettingOutlined />, label: '系统设置' }
  ];

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ background: '#001529', display: 'flex', alignItems: 'center' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>
          🏭 工业SCADA监控系统
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <Button type="primary" onClick={() => ipcRenderer.invoke('startDataCollection')}>
            开始采集
          </Button>
          <Button danger onClick={() => ipcRenderer.invoke('stopDataCollection')}>
            停止采集
          </Button>
        </div>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            onClick={handleMenuClick}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
          />
        </Sider>
        <Layout style={{ padding: '16px', background: '#f0f2f5' }}>
          <Content style={{ background: '#fff', padding: 24, margin: 0, minHeight: 280 }}>
            {activeTab === 'dashboard' && <Dashboard realtimeData={realtimeData} />}
            {activeTab === 'alarm' && <AlarmPanel />}
            {activeTab === 'history' && <div><h2>历史趋势（开发中）</h2></div>}
            {activeTab === 'data' && <div><h2>数据查询（开发中）</h2></div>}
            {activeTab === 'setting' && <div><h2>系统设置（开发中）</h2></div>}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default App;
