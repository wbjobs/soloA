export const SensorTypes = {
  TEMPERATURE: 'temperature',
  PRESSURE: 'pressure',
  VIBRATION: 'vibration',
  HUMIDITY: 'humidity',
  CURRENT: 'current',
  VOLTAGE: 'voltage'
};

export const AnomalyMethods = {
  THREE_SIGMA: '3sigma',
  ISOLATION_FOREST: 'isolation_forest'
};

export const AlertSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

export const AlertStatus = {
  ACTIVE: 'active',
  RESOLVED: 'resolved'
};

export const SeverityColors = {
  critical: '#ff4d4f',
  high: '#fa8c16',
  medium: '#faad14',
  low: '#52c41a'
};

export const MethodColors = {
  '3sigma': '#1890ff',
  'isolation_forest': '#722ed1'
};

export const SensorColors = {
  temperature: '#ff7875',
  pressure: '#40a9ff',
  vibration: '#73d13d',
  humidity: '#ffc53d',
  current: '#9254de',
  voltage: '#36cfc9'
};
