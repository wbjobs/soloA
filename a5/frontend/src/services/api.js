const API_BASE = '/api';

async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function simulateCircuit(circuit) {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(circuit),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '模拟失败');
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查后端服务是否启动');
    }
    throw error;
  }
}

export async function getAvailableGates() {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/gates`);
    return await response.json();
  } catch (error) {
    console.error('获取量子门列表失败:', error);
    return {
      single_qubit: ['H', 'X', 'Y', 'Z', 'S', 'T', 'I', 'Rx', 'Ry', 'Rz'],
      multi_qubit: ['CNOT', 'TOFFOLI'],
    };
  }
}

export async function saveCircuit(circuitData) {
  const response = await fetchWithTimeout(`${API_BASE}/circuits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(circuitData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '保存失败');
  }

  return await response.json();
}

export async function listCircuits() {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/circuits`);
    return await response.json();
  } catch (error) {
    console.error('获取电路列表失败:', error);
    return { success: true, data: [] };
  }
}

export async function getCircuit(circuitId) {
  const response = await fetchWithTimeout(`${API_BASE}/circuits/${circuitId}`);
  
  if (!response.ok) {
    throw new Error('电路不存在');
  }

  return await response.json();
}

export async function deleteCircuit(circuitId) {
  const response = await fetchWithTimeout(`${API_BASE}/circuits/${circuitId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('删除失败');
  }

  return await response.json();
}

export async function optimizeCircuit(circuit) {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(circuit),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '优化失败');
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查后端服务是否启动');
    }
    throw error;
  }
}

export async function exportLatex(circuit) {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/export/latex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(circuit),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '导出失败');
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查后端服务是否启动');
    }
    throw error;
  }
}
