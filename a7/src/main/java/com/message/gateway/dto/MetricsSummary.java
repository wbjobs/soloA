package com.message.gateway.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetricsSummary {

    private Long totalCount;
    private Long successCount;
    private Long failedCount;
    private Double successRate;
    private Long avgLatencyMs;
    private Long maxLatencyMs;
    private Long p95LatencyMs;

    private Map<String, ChannelMetrics> byChannel;
    private List<DailyMetrics> dailyTrend;
    private List<HourlyMetrics> hourlyTrend;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
class ChannelMetrics {
    private Long totalCount;
    private Long successCount;
    private Long failedCount;
    private Double successRate;
    private Long avgLatencyMs;
    private Long maxLatencyMs;
    private Long p95LatencyMs;
    private Map<String, ProviderMetrics> byProvider;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
class ProviderMetrics {
    private Long totalCount;
    private Long successCount;
    private Long failedCount;
    private Double successRate;
    private Long avgLatencyMs;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
class DailyMetrics {
    private String date;
    private Long totalCount;
    private Long successCount;
    private Long failedCount;
    private Double successRate;
    private Long avgLatencyMs;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
class HourlyMetrics {
    private String date;
    private Integer hour;
    private Long totalCount;
    private Long successCount;
    private Long failedCount;
    private Double successRate;
}
