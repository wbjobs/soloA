import dayjs from 'dayjs'

function generateDates(days) {
  const dates = []
  for (let i = days - 1; i >= 0; i--) {
    dates.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'))
  }
  return dates
}

export function getMockOverviewStats() {
  return {
    stats: {
      pv: 125800,
      uv: 28600,
      clicks: 45200,
      add_to_carts: 8900,
      purchases: 1280,
      total_revenue: 458600.50,
      click_through_rate: 35.9,
      cart_conversion_rate: 19.7,
      purchase_conversion_rate: 14.4,
      overall_conversion_rate: 4.48,
      avg_order_value: 358.28
    },
    trend: {
      dates: generateDates(7),
      pv: [15200, 16800, 17500, 18200, 19100, 17800, 21200],
      uv: [3200, 3400, 3600, 3800, 4100, 3700, 4400],
      orders: [150, 168, 175, 182, 195, 178, 232],
      revenue: [52000, 58000, 62000, 65000, 72000, 68000, 81600.50]
    }
  }
}

export function getMockConversionFunnel() {
  return {
    funnel: [
      { name: '浏览', users: 125800, percentage: 100, drop_off: 0 },
      { name: '点击', users: 45200, percentage: 35.9, drop_off: 64.1 },
      { name: '加购', users: 8900, percentage: 19.7, drop_off: 80.3 },
      { name: '下单', users: 1280, percentage: 14.4, drop_off: 85.6 }
    ],
    segments: [
      { name: '新用户', value: 8500 },
      { name: '活跃用户', value: 12200 },
      { name: '忠实用户', value: 5600 },
      { name: 'VIP用户', value: 1800 },
      { name: '流失用户', value: 3400 }
    ],
    repeat_purchase: {
      total_buyers: 850,
      repeat_buyers: 280,
      repeat_purchase_rate: 32.94
    }
  }
}

export function getMockProductPerformance() {
  const categories = ['分类_1', '分类_2', '分类_3', '分类_4', '分类_5']
  const products = []
  
  for (let i = 1; i <= 10; i++) {
    const views = Math.floor(Math.random() * 5000) + 1000
    const clicks = Math.floor(views * (0.2 + Math.random() * 0.2))
    const addToCarts = Math.floor(clicks * (0.15 + Math.random() * 0.1))
    const purchases = Math.floor(addToCarts * (0.1 + Math.random() * 0.1))
    const revenue = purchases * (Math.random() * 500 + 100)
    
    products.push({
      product_id: `product_${i}`,
      product_name: `热销商品 ${i}`,
      category: categories[i % 5],
      views,
      clicks,
      add_to_carts: addToCarts,
      purchases,
      revenue: Math.round(revenue * 100) / 100,
      click_through_rate: Math.round((clicks / views * 100) * 100) / 100,
      conversion_rate: Math.round((purchases / views * 100) * 100) / 100
    })
  }
  
  products.sort((a, b) => b.revenue - a.revenue)
  
  const hours = []
  for (let i = 0; i < 24; i++) {
    hours.push(`${i.toString().padStart(2, '0')}:00`)
  }
  
  const heatmapData = []
  for (let h = 0; h < 24; h++) {
    for (let c = 0; c < 5; c++) {
      const baseActivity = h >= 9 && h <= 21 ? 50 : 10
      heatmapData.push([h, c, Math.floor(Math.random() * baseActivity) + 5])
    }
  }
  
  return {
    products,
    heatmap: {
      categories,
      hours,
      data: heatmapData
    }
  }
}

export function getMockReports() {
  const types = ['overview', 'user', 'product']
  const formats = ['pdf', 'excel']
  const statuses = ['completed', 'completed', 'completed', 'processing', 'failed']
  
  const reports = []
  for (let i = 0; i < 8; i++) {
    const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    reports.push({
      id: i + 1,
      report_type: types[i % 3],
      start_date: date,
      end_date: date,
      format: formats[i % 2],
      status: statuses[i % 5],
      created_at: dayjs().subtract(i, 'day').format('YYYY-MM-DD HH:mm:ss'),
      download_url: i < 5 ? `/api/analytics/download/${i + 1}/` : null
    })
  }
  return reports
}
