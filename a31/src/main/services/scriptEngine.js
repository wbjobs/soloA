const EventEmitter = require('events');
const { NodeVM, VMScript } = require('vm2');

class SCADAScriptEngine extends EventEmitter {
  constructor() {
    super();
    this.scripts = new Map();
    this.runningScripts = new Map();
    this.scriptIntervals = new Map();
    this.dataStore = {};
    this.registeredTags = new Set();
    
    this._initBuiltInFunctions();
    this._loadDefaultScripts();
  }

  _initBuiltInFunctions() {
    this.builtInFunctions = {
      readTag: (tagId) => {
        return this.dataStore[tagId]?.value ?? null;
      },
      
      writeTag: async (tagId, value) => {
        this.emit('writeTag', { tagId, value });
        return true;
      },
      
      log: (message, level = 'info') => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        console.log(logMessage);
        this.emit('scriptLog', { message, level, timestamp });
        return logMessage;
      },
      
      delay: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
      },
      
      now: () => Date.now(),
      
      formatTime: (timestamp = Date.now()) => {
        return new Date(timestamp).toISOString();
      },
      
      map: (value, inMin, inMax, outMin, outMax) => {
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
      },
      
      clamp: (value, min, max) => {
        return Math.min(Math.max(value, min), max);
      },
      
      PID: (options = {}) => {
        return new PIDController(options);
      },
      
      setInterval: (callback, ms) => {
        return setInterval(callback, ms);
      },
      
      clearInterval: (id) => {
        clearInterval(id);
      },
      
      setTimeout: (callback, ms) => {
        return setTimeout(callback, ms);
      },
      
      clearTimeout: (id) => {
        clearTimeout(id);
      },
      
      getState: (key) => {
        return this.scriptStates?.[key];
      },
      
      setState: (key, value) => {
        if (!this.scriptStates) this.scriptStates = {};
        this.scriptStates[key] = value;
        return value;
      }
    };
  }

  _loadDefaultScripts() {
    this.defaultScripts = [
      {
        id: 'pid-temperature',
        name: '温度PID控制',
        description: '基于温度传感器反馈，控制加热器输出',
        type: 'javascript',
        enabled: true,
        interval: 1000,
        code: `
// PID 温度控制示例
// 目标温度 70°C，传感器读取 tag-temp，加热器输出 tag-heater

const targetTemp = 70;
const sensorTag = 'tag-temp';
const heaterTag = 'tag-heater';

// 获取或创建 PID 控制器
let pid = getState('pid-temp');
if (!pid) {
  pid = PID({
    kp: 2.0,      // 比例系数
    ki: 0.1,      // 积分系数
    kd: 0.5,      // 微分系数
    setpoint: targetTemp,
    outputMin: 0,
    outputMax: 100
  });
  setState('pid-temp', pid);
}

// 读取当前温度
const currentTemp = readTag(sensorTag);

if (currentTemp !== null) {
  // 计算 PID 输出
  const output = pid.compute(currentTemp);
  
  // 写入加热器控制值
  writeTag(heaterTag, output);
  
  log(\`温度: \${currentTemp.toFixed(1)}°C, 目标: \${targetTemp}°C, 输出: \${output.toFixed(1)}%\`);
}
`
      },
      {
        id: 'interlock-pump',
        name: '泵联锁保护',
        description: '当压力超过阈值时紧急停泵',
        type: 'javascript',
        enabled: true,
        interval: 500,
        code: `
// 联锁逻辑：压力超过 8MPa 时停泵，温度超过 90°C 时触发警报

const pressureTag = 'tag-pressure';
const pumpTag = 'tag-pump';
const tempTag = 'tag-temp';

const pressure = readTag(pressureTag);
const temp = readTag(tempTag);

// 获取当前联锁状态
let interlockTriggered = getState('interlock-pump') || false;

if (pressure !== null) {
  // 压力高联锁
  if (pressure > 8.0 && !interlockTriggered) {
    log('⚠️ 联锁触发：压力过高，紧急停泵！', 'warning');
    writeTag(pumpTag, 0);  // 停泵
    setState('interlock-pump', true);
    interlockTriggered = true;
  }
  
  // 联锁复位（压力恢复正常且手动确认）
  if (pressure < 5.0 && interlockTriggered) {
    log('✅ 联锁条件恢复，允许重新启动泵', 'info');
    setState('interlock-pump', false);
  }
}

if (temp !== null && temp > 90) {
  log(\`🔥 高温警报: \${temp.toFixed(1)}°C\`, 'error');
}
`
      },
      {
        id: 'flow-monitor',
        name: '流量监控',
        description: '监控流量，过低时自动调节阀门',
        type: 'javascript',
        enabled: true,
        interval: 2000,
        code: `
// 流量监控：流量低于 200 m³/h 时自动增大阀门开度

const flowTag = 'tag-flow';
const valveTag = 'tag-valve';
const minFlow = 200;
const maxValve = 100;

const flow = readTag(flowTag);
let valvePos = readTag(valveTag) || 50;

if (flow !== null) {
  if (flow < minFlow && valvePos < maxValve) {
    valvePos = Math.min(valvePos + 5, maxValve);
    writeTag(valveTag, valvePos);
    log(\`流量过低 \${flow} m³/h，增大阀门开度至 \${valvePos}%\`, 'warning');
  } else if (flow > 600 && valvePos > 20) {
    valvePos = Math.max(valvePos - 2, 20);
    writeTag(valveTag, valvePos);
    log(\`流量较高 \${flow} m³/h，减小阀门开度至 \${valvePos}%\`, 'info');
  }
}
`
      }
    ];

    this.defaultScripts.forEach(script => {
      this.scripts.set(script.id, script);
      if (script.enabled) {
        this.startScript(script.id);
      }
    });
  }

  updateDataStore(tagId, value, timestamp) {
    this.dataStore[tagId] = { value, timestamp: timestamp || Date.now() };
    this.registeredTags.add(tagId);
  }

  createVM(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) return null;

    const scriptState = {};

    const vm = new NodeVM({
      sandbox: {
        ...this.builtInFunctions,
        console: {
          log: (msg) => this.builtInFunctions.log(msg, 'info'),
          warn: (msg) => this.builtInFunctions.log(msg, 'warning'),
          error: (msg) => this.builtInFunctions.log(msg, 'error')
        },
        scriptId: scriptId,
        scriptName: script.name,
        __scriptStates: scriptState
      },
      require: false,
      timeout: 5000,
      compiler: 'javascript'
    });

    vm.run(`
      // 脚本状态持久化
      const __state = {};
      
      // 覆盖 getState/setState 使每个脚本有独立状态
      function getState(key) {
        return __state[key];
      }
      
      function setState(key, value) {
        __state[key] = value;
        return value;
      }
      
      // 暴露给用户脚本
      globalThis.getState = getState;
      globalThis.setState = setState;
    `, { filename: `${scriptId}-init.js` });

    return { vm, scriptState };
  }

  async runScript(scriptId, context = {}) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`脚本不存在: ${scriptId}`);
    }

    const startTime = Date.now();
    let result;

    try {
      let vmInstance = this.runningScripts.get(scriptId);
      if (!vmInstance) {
        vmInstance = this.createVM(scriptId);
        this.runningScripts.set(scriptId, vmInstance);
      }

      const { vm } = vmInstance;
      
      const code = `
        (function() {
          ${script.code}
        })();
      `;

      result = await vm.run(code, { filename: `${scriptId}.js` });
      
      const executionTime = Date.now() - startTime;
      this.emit('scriptExecuted', {
        scriptId,
        success: true,
        executionTime,
        timestamp: new Date().toISOString()
      });

      return { success: true, result, executionTime };

    } catch (err) {
      const executionTime = Date.now() - startTime;
      this.emit('scriptError', {
        scriptId,
        error: err.message,
        executionTime,
        timestamp: new Date().toISOString()
      });

      return { success: false, error: err.message, executionTime };
    }
  }

  startScript(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      console.error(`无法启动脚本：不存在 ${scriptId}`);
      return false;
    }

    if (this.scriptIntervals.has(scriptId)) {
      console.log(`脚本已在运行: ${scriptId}`);
      return true;
    }

    console.log(`启动脚本: ${script.name} (${scriptId})`);

    const interval = script.interval || 1000;

    this.runScript(scriptId);

    const intervalId = setInterval(() => {
      this.runScript(scriptId);
    }, interval);

    this.scriptIntervals.set(scriptId, intervalId);
    script.enabled = true;

    this.emit('scriptStarted', { scriptId, script });
    return true;
  }

  stopScript(scriptId) {
    const intervalId = this.scriptIntervals.get(scriptId);
    if (intervalId) {
      clearInterval(intervalId);
      this.scriptIntervals.delete(scriptId);
      
      const script = this.scripts.get(scriptId);
      if (script) {
        script.enabled = false;
      }
      
      console.log(`停止脚本: ${scriptId}`);
      this.emit('scriptStopped', { scriptId });
      return true;
    }
    return false;
  }

  addScript(scriptConfig) {
    const { id, name, code, type = 'javascript', enabled = false, interval = 1000, description = '' } = scriptConfig;

    if (this.scripts.has(id)) {
      throw new Error(`脚本 ID 已存在: ${id}`);
    }

    const script = {
      id,
      name,
      code,
      type,
      enabled,
      interval,
      description,
      createdAt: new Date().toISOString()
    };

    this.scripts.set(id, script);

    if (enabled) {
      this.startScript(id);
    }

    this.emit('scriptAdded', { script });
    return script;
  }

  removeScript(scriptId) {
    this.stopScript(scriptId);
    this.runningScripts.delete(scriptId);
    this.scripts.delete(scriptId);
    this.emit('scriptRemoved', { scriptId });
  }

  updateScript(scriptId, updates) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`脚本不存在: ${scriptId}`);
    }

    const wasEnabled = script.enabled;
    if (wasEnabled) {
      this.stopScript(scriptId);
    }

    Object.assign(script, updates);

    if (updates.enabled !== false && wasEnabled) {
      this.startScript(scriptId);
    }

    this.emit('scriptUpdated', { scriptId, script });
    return script;
  }

  getAllScripts() {
    return Array.from(this.scripts.values()).map(script => ({
      ...script,
      isRunning: this.scriptIntervals.has(script.id)
    }));
  }

  getScript(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) return null;
    return {
      ...script,
      isRunning: this.scriptIntervals.has(scriptId)
    };
  }

  validateScript(code, type = 'javascript') {
    try {
      if (type === 'javascript') {
        new Function(code);
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  stopAllScripts() {
    for (const scriptId of this.scriptIntervals.keys()) {
      this.stopScript(scriptId);
    }
    this.runningScripts.clear();
    console.log('所有脚本已停止');
  }
}

class PIDController {
  constructor(options = {}) {
    this.kp = options.kp ?? 1.0;
    this.ki = options.ki ?? 0.0;
    this.kd = options.kd ?? 0.0;
    
    this.setpoint = options.setpoint ?? 0;
    this.outputMin = options.outputMin ?? -Infinity;
    this.outputMax = options.outputMax ?? Infinity;
    
    this.integral = 0;
    this.lastError = 0;
    this.lastTime = null;
    this.previousOutput = 0;
    
    this.antiWindup = options.antiWindup ?? true;
  }

  compute(processVariable) {
    const now = Date.now();
    const dt = this.lastTime ? (now - this.lastTime) / 1000 : 0.01;
    
    const error = this.setpoint - processVariable;
    
    const proportional = this.kp * error;
    
    this.integral += this.ki * error * dt;
    
    if (this.antiWindup) {
      this.integral = this.clamp(this.integral, this.outputMin / Math.max(this.ki, 0.001), this.outputMax / Math.max(this.ki, 0.001));
    }
    
    const derivative = dt > 0 ? this.kd * (error - this.lastError) / dt : 0;
    
    let output = proportional + this.integral + derivative;
    output = this.clamp(output, this.outputMin, this.outputMax);
    
    this.lastError = error;
    this.lastTime = now;
    this.previousOutput = output;
    
    return output;
  }

  reset() {
    this.integral = 0;
    this.lastError = 0;
    this.lastTime = null;
  }

  setSetpoint(setpoint) {
    this.setpoint = setpoint;
  }

  setTunings(kp, ki, kd) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
}

const scriptEngine = new SCADAScriptEngine();

module.exports = {
  SCADAScriptEngine,
  PIDController,
  scriptEngine
};
