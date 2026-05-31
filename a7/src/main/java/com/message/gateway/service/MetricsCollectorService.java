package com.message.gateway.service;

import com.message.gateway.entity.MetricsLatency;
import com.message.gateway.entity.MetricsStats;
import com.message.gateway.enums.MessageStatus;
import com.message.gateway.repository.MetricsLatencyRepository;
import com.message.gateway.repository.MetricsStatsRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class MetricsCollectorService {

    @Autowired
    private MetricsLatencyRepository latencyRepository;

    @Autowired
    private MetricsStatsRepository statsRepository;

    private final Map<String, ChannelMetricsAccumulator> realtimeMetrics = new ConcurrentHashMap<>();

    @Scheduled(fixedRate = 5000)
    public void flushRealtimeMetrics() {
        for (Map.Entry<String, ChannelMetricsAccumulator> entry : realtimeMetrics.entrySet()) {
            ChannelMetricsAccumulator accumulator = entry.getValue();
            if (accumulator.hasData()) {
                try {
                    flushToDatabase(accumulator);
                    accumulator.reset();
                } catch (Exception e) {
                    log.error("Error flushing metrics for channel {}: {}", entry.getKey(), e.getMessage());
                }
            }
        }
    }

    public void recordSuccess(String channelType, String providerName, String businessId, long latencyMs) {
        String key = channelType + ":" + (providerName != null ? providerName : "default");
        realtimeMetrics.computeIfAbsent(key, k -> new ChannelMetricsAccumulator())
                .recordSuccess(providerName, businessId, latencyMs);

        saveLatencyDetail(channelType, providerName, businessId, latencyMs, MessageStatus.SUCCESS.name());
    }

    public void recordFailure(String channelType, String providerName, String businessId, long latencyMs) {
        String key = channelType + ":" + (providerName != null ? providerName : "default");
        realtimeMetrics.computeIfAbsent(key, k -> new ChannelMetricsAccumulator())
                .recordFailure(providerName, businessId, latencyMs);

        saveLatencyDetail(channelType, providerName, businessId, latencyMs, MessageStatus.FAILED.name());
    }

    private void saveLatencyDetail(String channelType, String providerName, String businessId,
                                   long latencyMs, String status) {
        try {
            MetricsLatency latency = new MetricsLatency();
            latency.setMessageId(UUID.randomUUID().toString().replace("-", "").substring(0, 32));
            latency.setChannelType(channelType);
            latency.setProviderName(providerName != null ? providerName : "default");
            latency.setBusinessId(businessId);
            latency.setLatencyMs(latencyMs);
            latency.setStatus(status);
            latencyRepository.save(latency);
        } catch (Exception e) {
            log.debug("Error saving latency detail: {}", e.getMessage());
        }
    }

    private void flushToDatabase(ChannelMetricsAccumulator accumulator) {
        LocalDate today = LocalDate.now();
        int currentHour = LocalTime.now().getHour();

        for (Map.Entry<String, ProviderMetricsAccumulator> entry : 
                accumulator.providerMetrics.entrySet()) {
            String providerName = entry.getKey();
            ProviderMetricsAccumulator providerMetrics = entry.getValue();

            updateDailyStats(today, accumulator.channelType, providerName, providerMetrics);
            updateHourlyStats(today, currentHour, accumulator.channelType, providerName, providerMetrics);
        }
    }

    private void updateDailyStats(LocalDate date, String channelType, String providerName,
                                   ProviderMetricsAccumulator metrics) {
        Optional<MetricsStats> existingOpt = statsRepository
                .findByStatDateAndStatHourAndChannelTypeAndProviderNameAndBusinessId(
                        date, null, channelType, providerName, null);

        MetricsStats stats;
        if (existingOpt.isPresent()) {
            stats = existingOpt.get();
        } else {
            stats = new MetricsStats();
            stats.setStatDate(date);
            stats.setStatHour(null);
            stats.setChannelType(channelType);
            stats.setProviderName(providerName);
            stats.setBusinessId(null);
        }

        stats.setTotalCount(stats.getTotalCount() + metrics.totalCount.get());
        stats.setSuccessCount(stats.getSuccessCount() + metrics.successCount.get());
        stats.setFailedCount(stats.getFailedCount() + metrics.failedCount.get());

        if (metrics.latencies.size() > 0) {
            long newTotal = stats.getAvgLatencyMs() * (stats.getTotalCount() - metrics.totalCount.get()) +
                    metrics.latencies.stream().mapToLong(Long::longValue).sum();
            stats.setAvgLatencyMs(newTotal / Math.max(stats.getTotalCount(), 1));
            stats.setMaxLatencyMs(Math.max(stats.getMaxLatencyMs(),
                    metrics.latencies.stream().max(Long::compare).orElse(0L)));
        }

        statsRepository.save(stats);
    }

    private void updateHourlyStats(LocalDate date, int hour, String channelType, String providerName,
                                    ProviderMetricsAccumulator metrics) {
        Optional<MetricsStats> existingOpt = statsRepository
                .findByStatDateAndStatHourAndChannelTypeAndProviderNameAndBusinessId(
                        date, hour, channelType, providerName, null);

        MetricsStats stats;
        if (existingOpt.isPresent()) {
            stats = existingOpt.get();
        } else {
            stats = new MetricsStats();
            stats.setStatDate(date);
            stats.setStatHour(hour);
            stats.setChannelType(channelType);
            stats.setProviderName(providerName);
            stats.setBusinessId(null);
        }

        stats.setTotalCount(stats.getTotalCount() + metrics.totalCount.get());
        stats.setSuccessCount(stats.getSuccessCount() + metrics.successCount.get());
        stats.setFailedCount(stats.getFailedCount() + metrics.failedCount.get());

        if (metrics.latencies.size() > 0) {
            long newTotal = stats.getAvgLatencyMs() * (stats.getTotalCount() - metrics.totalCount.get()) +
                    metrics.latencies.stream().mapToLong(Long::longValue).sum();
            stats.setAvgLatencyMs(newTotal / Math.max(stats.getTotalCount(), 1));
        }

        statsRepository.save(stats);
    }

    private static class ChannelMetricsAccumulator {
        String channelType;
        final Map<String, ProviderMetricsAccumulator> providerMetrics = new ConcurrentHashMap<>();

        boolean hasData() {
            return providerMetrics.values().stream().anyMatch(p -> p.totalCount.get() > 0);
        }

        void recordSuccess(String providerName, String businessId, long latencyMs) {
            providerMetrics.computeIfAbsent(providerName, k -> new ProviderMetricsAccumulator())
                    .recordSuccess(latencyMs);
        }

        void recordFailure(String providerName, String businessId, long latencyMs) {
            providerMetrics.computeIfAbsent(providerName, k -> new ProviderMetricsAccumulator())
                    .recordFailure(latencyMs);
        }

        void reset() {
            providerMetrics.values().forEach(ProviderMetricsAccumulator::reset);
        }
    }

    private static class ProviderMetricsAccumulator {
        final AtomicLong totalCount = new AtomicLong(0);
        final AtomicLong successCount = new AtomicLong(0);
        final AtomicLong failedCount = new AtomicLong(0);
        final List<Long> latencies = Collections.synchronizedList(new ArrayList<>());

        void recordSuccess(long latencyMs) {
            totalCount.incrementAndGet();
            successCount.incrementAndGet();
            latencies.add(latencyMs);
        }

        void recordFailure(long latencyMs) {
            totalCount.incrementAndGet();
            failedCount.incrementAndGet();
            latencies.add(latencyMs);
        }

        void reset() {
            totalCount.set(0);
            successCount.set(0);
            failedCount.set(0);
            latencies.clear();
        }
    }
}
