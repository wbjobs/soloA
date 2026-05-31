const { broadcastAlarm, getTags, getRealtimeData } = require('../ipc/handlers');
const { saveAlarm } = require('../database/sqliteDb');

let ruleCheckInterval = null;
const triggeredAlarms = new Map();
const ALARM_COOLDOWN = 10000;

const defaultRules = [
  {
    id: 'rule-temp-high',
    tagId: 'tag-temp',
    type: 'threshold',
    condition: 'value > 80',
    level: 'high',
    message: '车间温度过高',
    description: '温度超过安全阈值'
  },
  {
    id: 'rule-temp-low',
    tagId: 'tag-temp',
    type: 'threshold',
    condition: 'value < 10',
    level: 'warning',
    message: '车间温度过低',
    description: '温度低于正常范围'
  },
  {
    id: 'rule-pressure-high',
    tagId: 'tag-pressure',
    type: 'threshold',
    condition: 'value > 8',
    level: 'high',
    message: '管道压力过高',
    description: '压力超过安全阈值'
  },
  {
    id: 'rule-pressure-low',
    tagId: 'tag-pressure',
    type: 'threshold',
    condition: 'value < 0.5',
    level: 'warning',
    message: '管道压力过低',
    description: '压力低于正常范围'
  },
  {
    id: 'rule-flow-high',
    tagId: 'tag-flow',
    type: 'threshold',
    condition: 'value > 800',
    level: 'warning',
    message: '流量过高',
    description: '流量超过正常范围'
  },
  {
    id: 'rule-flow-low',
    tagId: 'tag-flow',
    type: 'threshold',
    condition: 'value < 100',
    level: 'warning',
    message: '流量过低',
    description: '流量低于正常范围'
  }
];

const evaluateRule = (rule, value) => {
  try {
    if (rule.type === 'threshold') {
      if (rule.condition.includes('>')) {
        const parts = rule.condition.split('>');
        const threshold = parseFloat(parts[1].trim());
        return value > threshold;
      } else if (rule.condition.includes('<')) {
        const parts = rule.condition.split('<');
        const threshold = parseFloat(parts[1].trim());
        return value < threshold;
      } else if (rule.condition.includes('>=')) {
        const parts = rule.condition.split('>=');
        const threshold = parseFloat(parts[1].trim());
        return value >= threshold;
      } else if (rule.condition.includes('<=')) {
        const parts = rule.condition.split('<=');
        const threshold = parseFloat(parts[1].trim());
        return value <= threshold;
      } else if (rule.condition.includes('==')) {
        const parts = rule.condition.split('==');
        const threshold = parseFloat(parts[1].trim());
        return value === threshold;
      } else if (rule.condition.includes('!=')) {
        const parts = rule.condition.split('!=');
        const threshold = parseFloat(parts[1].trim());
        return value !== threshold;
      }
    }
    
    const func = new Function('value', `return ${rule.condition};`);
    return func(value);
  } catch (err) {
    console.error('规则评估失败:', err.message);
    return false;
  }
};

const checkRules = () => {
  const realtimeData = getRealtimeData();
  const tags = getTags();
  
  for (const rule of defaultRules) {
    try {
      const tagData = realtimeData[rule.tagId];
      if (!tagData || tagData.value === null || tagData.value === undefined) continue;
      
      const isTriggered = evaluateRule(rule, tagData.value);
      const now = Date.now();
      const lastTriggered = triggeredAlarms.get(rule.id);
      
      if (isTriggered) {
        if (!lastTriggered || (now - lastTriggered > ALARM_COOLDOWN)) {
          const tag = tags.find(t => t.id === rule.tagId);
          const alarm = {
            id: `${rule.id}-${now}`,
            ruleId: rule.id,
            tagId: rule.tagId,
            tagName: tag ? tag.name : rule.tagId,
            level: rule.level,
            message: `${rule.message} (当前值: ${tagData.value} ${tagData.unit || ''})`,
            value: tagData.value,
            unit: tagData.unit,
            acknowledged: false
          };
          
          broadcastAlarm(alarm);
          saveAlarm(alarm);
          triggeredAlarms.set(rule.id, now);
          
          console.log(`[报警] ${rule.level.toUpperCase()}: ${alarm.message}`);
        }
      }
    } catch (err) {
      console.error('规则检查失败:', err.message);
    }
  }
};

const startRuleEngine = () => {
  if (ruleCheckInterval) return;
  
  ruleCheckInterval = setInterval(checkRules, 1000);
  console.log('边缘规则引擎已启动');
};

const stopRuleEngine = () => {
  if (ruleCheckInterval) {
    clearInterval(ruleCheckInterval);
    ruleCheckInterval = null;
  }
  console.log('边缘规则引擎已停止');
};

startRuleEngine();

module.exports = {
  startRuleEngine,
  stopRuleEngine,
  defaultRules,
  evaluateRule,
  checkRules
};
