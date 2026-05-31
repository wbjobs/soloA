import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000
})

export const uploadCSV = (symbol, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/stocks/upload/${symbol}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export const getSymbols = () => {
  return api.get('/stocks/symbols')
}

export const getStockData = (symbol) => {
  return api.get(`/stocks/data/${symbol}`)
}

export const runBacktest = (data) => {
  return api.post('/stocks/backtest', data)
}

export const runPortfolioBacktest = (data) => {
  return api.post('/stocks/portfolio/backtest', data)
}

export default api
