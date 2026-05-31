import request from '@/utils/request'

export function getOverviewStats(params) {
  return request({
    url: '/analytics/overview/',
    method: 'get',
    params
  })
}

export function getConversionFunnel(params) {
  return request({
    url: '/analytics/funnel/',
    method: 'get',
    params
  })
}

export function getProductPerformance(params) {
  return request({
    url: '/analytics/products/',
    method: 'get',
    params
  })
}

export function getRetention(params) {
  return request({
    url: '/analytics/retention/',
    method: 'get',
    params
  })
}

export function exportReport(data) {
  return request({
    url: '/analytics/export/',
    method: 'post',
    data
  })
}

export function getReports() {
  return request({
    url: '/analytics/reports/',
    method: 'get'
  })
}
