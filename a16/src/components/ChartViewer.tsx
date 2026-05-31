import { useState, useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { useAppStore } from '../store/appStore'
import { ChartConfig, QueryResult } from '../types/electron'
import * as echarts from 'echarts'

const defaultConfig: ChartConfig = {
  chartType: 'bar',
  xAxis: '',
  yAxis: '',
  yAxisType: 'sum',
  title: '数据可视化'
}

export default function ChartViewer() {
  const { queryResult, activeConnectionId } = useAppStore()
  const [config, setConfig] = useState<ChartConfig>({ ...defaultConfig })
  const [chartData, setChartData] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [tables, setTables] = useState<string[]>([])
  const [customSql, setCustomSql] = useState('')
  const [dataSource, setDataSource] = useState<'result' | 'custom'>('result')
  const chartRef = useRef<ReactECharts>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (activeConnectionId) {
      loadTables()
    }
  }, [activeConnectionId])

  useEffect(() => {
    if (queryResult && queryResult.columns.length > 0) {
      setColumns(queryResult.columns)
      if (!config.xAxis && queryResult.columns.length > 0) {
        setConfig(prev => ({ ...prev, xAxis: queryResult.columns[0] }))
      }
      if (!config.yAxis && queryResult.columns.length > 1) {
        setConfig(prev => ({ ...prev, yAxis: queryResult.columns[1] }))
      }
    }
  }, [queryResult])

  useEffect(() => {
    updateChartData()
  }, [config, queryResult])

  const loadTables = async () => {
    if (!window.electronAPI || !activeConnectionId) return
    try {
      const response = await window.electronAPI.database.tables(activeConnectionId)
      if (response.success) {
        setTables(response.data || [])
      }
    } catch (err: any) {
      console.error('加载表失败:', err)
    }
  }

  const loadCustomData = async () => {
    if (!window.electronAPI || !activeConnectionId || !customSql.trim()) return
    setLoading(true)
    try {
      const response = await window.electronAPI.database.query(activeConnectionId, customSql)
      if (response.success && response.data) {
        setColumns(response.data.columns || [])
        setChartData(response.data.rows || [])
        if (response.data.columns.length > 0 && !config.xAxis) {
          setConfig(prev => ({ ...prev, xAxis: response.data.columns![0] }))
        }
        if (response.data.columns.length > 1 && !config.yAxis) {
          setConfig(prev => ({ ...prev, yAxis: response.data.columns![1] }))
        }
      }
    } catch (err: any) {
      console.error('查询失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateChartData = () => {
    if (!config.xAxis || !config.yAxis) {
      setChartData([])
      return
    }

    const source = dataSource === 'result' ? (queryResult?.rows || []) : chartData
    if (source.length === 0) return

    if (config.chartType === 'pie') {
      const aggregated: Record<string, number> = {}
      source.forEach(row => {
        const xVal = String(row[config.xAxis])
        const yVal = parseFloat(row[config.yAxis]) || 0
        if (!isNaN(yVal)) {
          aggregated[xVal] = (aggregated[xVal] || 0) + yVal
        }
      })
      const pieData = Object.entries(aggregated).map(([name, value]) => ({ name, value }))
      setChartData(pieData)
    } else {
      const aggregated: Record<string, { count: number; sum: number; values: number[] }> = {}
      source.forEach(row => {
        const xVal = String(row[config.xAxis])
        const yVal = parseFloat(row[config.yAxis])
        if (isNaN(yVal)) return

        if (!aggregated[xVal]) {
          aggregated[xVal] = { count: 0, sum: 0, values: [] }
        }
        aggregated[xVal].count++
        aggregated[xVal].sum += yVal
        aggregated[xVal].values.push(yVal)
      })

      const xData = Object.keys(aggregated)
      const yData = xData.map(x => {
        const agg = aggregated[x]
        switch (config.yAxisType) {
          case 'count': return agg.count
          case 'avg': return agg.sum / agg.count
          case 'max': return Math.max(...agg.values)
          case 'min': return Math.min(...agg.values)
          default: return agg.sum
        }
      })

      if (config.chartType === 'scatter') {
        const scatterData = source
          .filter(row => !isNaN(parseFloat(row[config.yAxis])))
          .map((row, idx) => [String(row[config.xAxis]), parseFloat(row[config.yAxis])])
        setChartData(scatterData)
      } else {
        setChartData([xData, yData])
      }
    }
  }

  const getChartOption = (): echarts.EChartsOption => {
    const baseOption: echarts.EChartsOption = {
      title: {
        text: config.title,
        left: 'center'
      },
      tooltip: {
        trigger: config.chartType === 'pie' ? 'item' : 'axis'
      },
      legend: {
        bottom: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      }
    }

    if (config.chartType === 'pie') {
      return {
        ...baseOption,
        series: [{
          name: config.yAxis,
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: true,
            formatter: '{b}: {c} ({d}%)'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold'
            }
          },
          data: chartData.length > 0 ? chartData : [{ name: '无数据', value: 1 }]
        }]
      }
    }

    if (config.chartType === 'scatter') {
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: chartData.length > 0 ? chartData.map((d: any) => d[0]) : []
        },
        yAxis: {
          type: 'value',
          name: config.yAxis
        },
        series: [{
          symbolSize: 10,
          data: chartData.length > 0 ? chartData : [],
          type: 'scatter'
        }]
      }
    }

    const xData = chartData.length > 0 ? chartData[0] : []
    const yData = chartData.length > 0 ? chartData[1] : []

    return {
      ...baseOption,
      xAxis: {
        type: 'category',
        data: xData.length > 0 ? xData : ['无数据'],
        axisLabel: {
          rotate: xData.length > 10 ? 30 : 0,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: config.yAxis
      },
      series: [{
        name: config.yAxis,
        type: config.chartType,
        data: yData.length > 0 ? yData : [0],
        smooth: config.chartType === 'line',
        itemStyle: {
          color: config.chartType === 'bar' ? '#3b82f6' : '#10b981'
        },
        areaStyle: config.chartType === 'line' ? {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
          ])
        } : undefined
      }]
    }
  }

  const handleExportPNG = async () => {
    if (!chartRef.current || !window.electronAPI) return
    const instance = chartRef.current.getEchartsInstance()
    const base64 = instance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff'
    })
    await window.electronAPI.export.chart(base64, config.title || 'chart', 'png')
  }

  const handleExportSVG = async () => {
    if (!chartRef.current || !window.electronAPI) return
    const instance = chartRef.current.getEchartsInstance()
    const svg = instance.renderToSVGString()
    await window.electronAPI.export.chart(svg, config.title || 'chart', 'svg')
  }

  const handleSelectTable = async (tableName: string) => {
    setCustomSql(`SELECT * FROM ${tableName} LIMIT 1000`)
    setDataSource('custom')
  }

  return (
    <div className="h-full flex">
      <aside className="w-80 bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-700 flex flex-col p-4 shrink-0 overflow-auto">
        <h3 className="font-bold text-lg mb-4">📈 图表配置</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">数据源</label>
          <select
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as 'result' | 'custom')}
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
          >
            <option value="result">使用 SQL 编辑器查询结果</option>
            <option value="custom">自定义查询</option>
          </select>
        </div>

        {dataSource === 'custom' && activeConnectionId && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-700 rounded">
            <h4 className="text-sm font-medium mb-2">选择表快速查询</h4>
            {tables.length === 0 ? (
              <p className="text-xs text-gray-500">暂无表</p>
            ) : (
              <div className="max-h-24 overflow-auto space-y-1">
                {tables.map(table => (
                  <button
                    key={table}
                    onClick={() => handleSelectTable(table)}
                    className="block w-full text-left px-2 py-1 text-xs rounded hover:bg-primary-100 dark:hover:bg-primary-900"
                  >
                    📋 {table}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              placeholder="输入自定义 SQL 查询..."
              className="w-full mt-2 px-2 py-1 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-800 text-xs font-mono"
              rows={3}
            />
            <button
              onClick={loadCustomData}
              disabled={loading || !customSql.trim()}
              className="w-full mt-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded text-sm"
            >
              {loading ? '加载中...' : '▶ 执行查询'}
            </button>
          </div>
        )}

        {!queryResult && dataSource === 'result' && (
          <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
            💡 请先在 SQL 编辑器中执行查询以获取数据
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">图表类型</label>
            <select
              value={config.chartType}
              onChange={(e) => setConfig(prev => ({ ...prev, chartType: e.target.value as ChartConfig['chartType'] }))}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
            >
              <option value="bar">📊 柱状图</option>
              <option value="line">📈 折线图</option>
              <option value="pie">🥧 饼图</option>
              <option value="scatter">⚬ 散点图</option>
            </select>
          </div>

          {columns.length > 0 ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">X 轴（分类）</label>
                <select
                  value={config.xAxis}
                  onChange={(e) => setConfig(prev => ({ ...prev, xAxis: e.target.value }))}
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
                >
                  <option value="">请选择</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Y 轴（数值）</label>
                <select
                  value={config.yAxis}
                  onChange={(e) => setConfig(prev => ({ ...prev, yAxis: e.target.value }))}
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
                >
                  <option value="">请选择</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              {config.chartType !== 'pie' && config.chartType !== 'scatter' && (
                <div>
                  <label className="block text-sm font-medium mb-1">聚合方式</label>
                  <select
                    value={config.yAxisType}
                    onChange={(e) => setConfig(prev => ({ ...prev, yAxisType: e.target.value as ChartConfig['yAxisType'] }))}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
                  >
                    <option value="sum">求和 (SUM)</option>
                    <option value="count">计数 (COUNT)</option>
                    <option value="avg">平均值 (AVG)</option>
                    <option value="max">最大值 (MAX)</option>
                    <option value="min">最小值 (MIN)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">图表标题</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-700">
          <h4 className="text-sm font-medium mb-2">导出图表</h4>
          <div className="flex gap-2">
            <button
              onClick={handleExportPNG}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            >
              🖼️ PNG
            </button>
            <button
              onClick={handleExportSVG}
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
            >
              📄 SVG
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 overflow-hidden">
        <div className="h-full bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 overflow-hidden">
          {columns.length === 0 || !config.xAxis || !config.yAxis ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-6xl mb-4">📊</p>
                <p className="text-lg">请配置图表参数</p>
                <p className="text-sm mt-2 text-gray-400">
                  {dataSource === 'result'
                    ? '先在 SQL 编辑器中执行查询，然后选择 X 轴和 Y 轴字段'
                    : '请选择数据表或输入 SQL 查询'}
                </p>
              </div>
            </div>
          ) : (
            <ReactECharts
              ref={chartRef}
              option={getChartOption()}
              style={{ height: '100%', width: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          )}
        </div>
      </main>
    </div>
  )
}
