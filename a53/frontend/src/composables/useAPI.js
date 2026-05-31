import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

export function useAPI() {
  const uploadTileset = async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/maps/upload-tileset', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  }

  const sliceTileset = async (file, options = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tileWidth', options.tileWidth || 32)
    formData.append('tileHeight', options.tileHeight || 32)
    formData.append('margin', options.margin || 0)
    formData.append('spacing', options.spacing || 0)
    formData.append('removeEmpty', options.removeEmpty !== false)
    
    const response = await api.post('/maps/slice-tileset', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  }

  const startBake = async (mapData, ambientLight = 0.2) => {
    const response = await api.post('/maps/bake', {
      mapData,
      ambientLight
    })
    return response.data
  }

  const startBatchBake = async (maps, ambientLight = 0.2) => {
    const response = await api.post('/maps/batch-bake', {
      maps,
      ambientLight
    })
    return response.data
  }

  const getTaskStatus = async (taskId) => {
    const response = await api.get(`/tasks/${taskId}`)
    return response.data
  }

  const getTaskProgress = async (taskId) => {
    const response = await api.get(`/tasks/${taskId}/progress`)
    return response.data
  }

  return {
    uploadTileset,
    sliceTileset,
    startBake,
    startBatchBake,
    getTaskStatus,
    getTaskProgress
  }
}
