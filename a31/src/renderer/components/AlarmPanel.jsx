import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, Popconfirm, Card, Row, Col, Statistic, message, Badge } from 'antd';
import { WarningOutlined, CheckCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { ipcRenderer } from 'electron';
import dayjs from 'dayjs';

const AlarmPanel = () => {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    loadAlarms();
    
    ipcRenderer.on('alarm-triggered', (event, alarm) => {
      setAlarms(prev => [alarm, ...prev]);
      if (soundEnabled) {
        playAlarmSound(alarm.level);
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('alarm-triggered');
    };
  }, [soundEnabled]);

  const loadAlarms = async () => {
    setLoading(true);
    try {
      const data = await ipcRenderer.invoke('getAlarmHistory', { limit: 100 });
      setAlarms(data);
    } catch (err) {
      message.error('加载报警历史失败');
    }
    setLoading(false);
  };

  const playAlarmSound = (level) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = level === 'high' ? 800 : 500;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.warn('无法播放报警声音:', e.message);
    }
  };

  const handleAcknowledge = async (alarmId) => {
    try {
      const result = await ipcRenderer.invoke('acknowledgeAlarm', alarmId);
      if (result.success) {
        setAlarms(prev => prev.map(alarm => 
          alarm.id === alarmId ? { ...alarm, acknowledged: true } : alarm
        ));
        message.success('报警已确认');
      }
    } catch (err) {
      message.error('确认报警失败');
    }
  };

  const unacknowledgedCount = alarms.filter(a => !a.acknowledged).length;
  const highCount = alarms.filter(a => a.level === 'high').length;
  const warningCount = alarms.filter(a => a.level === 'warning').length;

  const columns = [
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <Badge 
          status={record.acknowledged ? 'default' : 'warning'} 
          text={record.acknowledged ? '已确认' : '未确认'}
        />
      )
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level) => {
        const color = level === 'high' ? 'red' : 'orange';
        return (
          <Tag color={color}>
            {level === 'high' ? '高' : '警告'}
          </Tag>
        );
      },
      filters: [
        { text: '高', value: 'high' },
        { text: '警告', value: 'warning' }
      ],
      onFilter: (value, record) => record.level === value
    },
    {
      title: '标签',
      dataIndex: 'tagName',
      key: 'tagName',
      width: 150
    },
    {
      title: '报警信息',
      dataIndex: 'message',
      key: 'message'
    },
    {
      title: '当前值',
      key: 'value',
      width: 100,
      render: (_, record) => (
        <span>{record.value} {record.unit || ''}</span>
      )
    },
    {
      title: '发生时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          {!record.acknowledged && (
            <Button 
              type="primary" 
              size="small"
              onClick={() => handleAcknowledge(record.id)}
            >
              确认
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="未确认报警"
              value={unacknowledgedCount}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="高优先级报警"
              value={highCount}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="警告级别报警"
              value={warningCount}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            报警管理
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<SoundOutlined />}
              onClick={() => setSoundEnabled(!soundEnabled)}
              type={soundEnabled ? 'primary' : 'default'}
            >
              声音: {soundEnabled ? '开' : '关'}
            </Button>
            <Button onClick={loadAlarms}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={alarms}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条报警`
          }}
          rowClassName={(record) => !record.acknowledged ? 'alarm-unack' : ''}
        />
      </Card>

      <style>{`
        .alarm-unack {
          background-color: #fff2f0;
        }
        .alarm-unack:hover > td {
          background-color: #fff1f0 !important;
        }
      `}</style>
    </div>
  );
};

export default AlarmPanel;
