package com.message.gateway.service;

import com.message.gateway.dto.*;
import com.message.gateway.entity.MetricsLatency;
import com.message.gateway.entity.MetricsStats;
import com.message.gateway.repository.MetricsLatencyRepository;
import com.message.gateway.repository.MetricsStatsRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MetricsQueryService {

    @Autowired
    private MetricsStatsRepository statsRepository;

    @Autowired
    private MetricsLatencyRepository latencyRepository;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    public MetricsSummary getOverallSummary(int days) {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(days - 1);

        List<MetricsStats> stats = statsRepository.findDailyStatsByDateRange(startDate, endDate);

        long totalCount = 0;
        long successCount = 0;
        long failedCount = 0;
        long totalLatency = 0;
        long latencyCount = 0;
        long maxLatency = 0;

        Map<String, ChannelMetrics> byChannel = new HashMap<>();

        for (MetricsStats stat : stats) {
            totalCount += stat.getTotalCount();
            successCount += stat.getSuccessCount();
            failedCount += stat.getFailedCount();
            if (stat.getAvgLatencyMs() > 0 && stat.getTotalCount() > 0) {
                totalLatency += stat.getAvgLatencyMs() * stat.getTotalCount();
                latencyCount += stat.getTotalCount();
            }
            maxLatency = Math.max(maxLatency, stat.getMaxLatencyMs());

            byChannel.computeIfAbsent(stat.getChannelType(), k -> ChannelMetrics.builder()
                    .totalCount(0L)
                    .successCount(0L)
                    .failedCount(0L)
                    .byProvider(new HashMap<>())
                    .build());

            ChannelMetrics channelMetrics = byChannel.get(stat.getChannelType());
            channelMetrics.setTotalCount(channelMetrics.getTotalCount() + stat.getTotalCount());
            channelMetrics.setSuccessCount(channelMetrics.getSuccessCount() + stat.getSuccessCount());
            channelMetrics.setFailedCount(channelMetrics.getFailedCount() + stat.getFailedCount());

            if (stat.getProviderName() != null) {
                channelMetrics.getByProvider().computeIfAbsent(stat.getProviderName(), k -> ProviderMetrics.builder()
                        .totalCount(0L)
                        .successCount(0L)
                        .failedCount(0L)
                        .build());

                ProviderMetrics providerMetrics = channelMetrics.getByProvider().get(stat.getProviderName());
                providerMetrics.setTotalCount(providerMetrics.getTotalCount() + stat.getTotalCount());
                providerMetrics.setSuccessCount(providerMetrics.getSuccessCount() + stat.getSuccessCount());
                providerMetrics.setFailedCount(providerMetrics.getFailedCount() + stat.getFailedCount());
            }
        }

        for (ChannelMetrics cm : byChannel.values()) {
            cm.setSuccessRate(calculateSuccessRate(cm.getTotalCount(), cm.getSuccessCount()));
            for (ProviderMetrics pm : cm.getByProvider().values()) {
                pm.setSuccessRate(calculateSuccessRate(pm.getTotalCount(), pm.getSuccessCount()));
            }
        }

        List<DailyMetrics> dailyTrend = calculateDailyTrend(startDate, endDate);

        return MetricsSummary.builder()
                .totalCount(totalCount)
                .successCount(successCount)
                .failedCount(failedCount)
                .successRate(calculateSuccessRate(totalCount, successCount))
                .avgLatencyMs(latencyCount > 0 ? totalLatency / latencyCount : 0L)
                .maxLatencyMs(maxLatency)
                .byChannel(byChannel)
                .dailyTrend(dailyTrend)
                .hourlyTrend(calculateHourlyTrend(endDate))
                .build();
    }

    private List<DailyMetrics> calculateDailyTrend(LocalDate startDate, LocalDate endDate) {
        List<DailyMetrics> result = new ArrayList<>();
        LocalDate current = startDate;

        while (!current.isAfter(endDate)) {
            List<MetricsStats> dailyStats = statsRepository.findDailyStatsByDate(current);

            long totalCount = 0;
            long successCount = 0;
            long failedCount = 0;
            long totalLatency = 0;
            long latencyCount = 0;

            for (MetricsStats stat : dailyStats) {
                totalCount += stat.getTotalCount();
                successCount += stat.getSuccessCount();
                failedCount += stat.getFailedCount();
                if (stat.getAvgLatencyMs() > 0 && stat.getTotalCount() > 0) {
                    totalLatency += stat.getAvgLatencyMs() * stat.getTotalCount();
                    latencyCount += stat.getTotalCount();
                }
            }

            result.add(DailyMetrics.builder()
                    .date(current.format(DATE_FORMATTER))
                    .totalCount(totalCount)
                    .successCount(successCount)
                    .failedCount(failedCount)
                    .successRate(calculateSuccessRate(totalCount, successCount))
                    .avgLatencyMs(latencyCount > 0 ? totalLatency / latencyCount : 0L)
                    .build());

            current = current.plusDays(1);
        }

        return result;
    }

    private List<HourlyMetrics> calculateHourlyTrend(LocalDate date) {
        List<HourlyMetrics> result = new ArrayList<>();
        List<MetricsStats> hourlyStats = statsRepository.findHourlyStatsByDate(date);

        Map<Integer, List<MetricsStats>> byHour = hourlyStats.stream()
                .collect(Collectors.groupingBy(MetricsStats::getStatHour));

        for (int hour = 0; hour < 24; hour++) {
            List<MetricsStats> statsForHour = byHour.getOrDefault(hour, Collections.emptyList());

            long totalCount = 0;
            long successCount = 0;
            long failedCount = 0;

            for (MetricsStats stat : statsForHour) {
                totalCount += stat.getTotalCount();
                successCount += stat.getSuccessCount();
                failedCount += stat.getFailedCount();
            }

            result.add(HourlyMetrics.builder()
                    .date(date.format(DATE_FORMATTER))
                    .hour(hour)
                    .totalCount(totalCount)
                    .successCount(successCount)
                    .failedCount(failedCount)
                    .successRate(calculateSuccessRate(totalCount, successCount))
                    .build());
        }

        return result;
    }

    public Map<String, Object> getRealtimeStatus() {
        Map<String, Object> result = new HashMap<>();

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime fiveMinutesAgo = now.minusMinutes(5);

        List<MetricsLatency> recentLatencies = latencyRepository.findByTimeRange(fiveMinutesAgo, now);

        long totalCount = recentLatencies.size();
        long successCount = recentLatencies.stream()
                .filter(l -> "SUCCESS".equals(l.getStatus()))
                .count();
        long failedCount = totalCount - successCount;

        Map<String, Long> byChannel = recentLatencies.stream()
                .collect(Collectors.groupingBy(MetricsLatency::getChannelType, Collectors.counting()));

        Map<String, Double> channelSuccessRate = new HashMap<>();
        for (String channel : byChannel.keySet()) {
            long channelTotal = byChannel.get(channel);
            long channelSuccess = recentLatencies.stream()
                    .filter(l -> channel.equals(l.getChannelType()) && "SUCCESS".equals(l.getStatus()))
                    .count();
            channelSuccessRate.put(channel, calculateSuccessRate(channelTotal, channelSuccess));
        }

        long avgLatency = 0;
        if (!recentLatencies.isEmpty()) {
            avgLatency = (long) recentLatencies.stream()
                    .mapToLong(MetricsLatency::getLatencyMs)
                    .average()
                    .orElse(0.0);
        }

        result.put("timeWindowMinutes", 5);
        result.put("totalCount", totalCount);
        result.put("successCount", successCount);
        result.put("failedCount", failedCount);
        result.put("successRate", calculateSuccessRate(totalCount, successCount));
        result.put("avgLatencyMs", avgLatency);
        result.put("byChannel", byChannel);
        result.put("channelSuccessRate", channelSuccessRate);

        return result;
    }

    public List<Map<String, Object>> getProviderPerformance(String channelType) {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(7);

        List<MetricsStats> stats = statsRepository.findByDateRangeAndChannel(startDate, endDate, channelType);

        Map<String, ProviderPerformance> byProvider = new HashMap<>();

        for (MetricsStats stat : stats) {
            String provider = stat.getProviderName() != null ? stat.getProviderName() : "default";

            byProvider.computeIfAbsent(provider, k -> new ProviderPerformance());

            ProviderPerformance pp = byProvider.get(provider);
            pp.totalCount += stat.getTotalCount();
            pp.successCount += stat.getSuccessCount();
            pp.failedCount += stat.getFailedCount();
            if (stat.getAvgLatencyMs() > 0 && stat.getTotalCount() > 0) {
                pp.totalLatency += stat.getAvgLatencyMs() * stat.getTotalCount();
                pp.latencyCount += stat.getTotalCount();
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, ProviderPerformance> entry : byProvider.entrySet()) {
            ProviderPerformance pp = entry.getValue();
            Map<String, Object> providerData = new HashMap<>();
            providerData.put("provider", entry.getKey());
            providerData.put("totalCount", pp.totalCount);
            providerData.put("successCount", pp.successCount);
            providerData.put("failedCount", pp.failedCount);
            providerData.put("successRate", calculateSuccessRate(pp.totalCount, pp.successCount));
            providerData.put("avgLatencyMs", pp.latencyCount > 0 ? pp.totalLatency / pp.latencyCount : 0L);
            result.add(providerData);
        }

        return result;
    }

    private Double calculateSuccessRate(long total, long success) {
        if (total == 0) return 0.0;
        return Math.round((double) success / total * 10000.0) / 100.0;
    }

    private static class ProviderPerformance {
        long totalCount = 0;
        long successCount = 0;
        long failedCount = 0;
        long totalLatency = 0;
        long latencyCount = 0;
    }
}
