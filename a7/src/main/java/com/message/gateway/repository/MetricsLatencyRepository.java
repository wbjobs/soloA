package com.message.gateway.repository;

import com.message.gateway.entity.MetricsLatency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MetricsLatencyRepository extends JpaRepository<MetricsLatency, Long> {

    List<MetricsLatency> findByMessageId(String messageId);

    List<MetricsLatency> findByChannelType(String channelType);

    @Query("SELECT m FROM MetricsLatency m WHERE m.createdAt >= :startTime AND m.createdAt <= :endTime")
    List<MetricsLatency> findByTimeRange(@Param("startTime") LocalDateTime startTime,
                                          @Param("endTime") LocalDateTime endTime);

    @Query("SELECT m FROM MetricsLatency m WHERE m.createdAt >= :startTime AND m.createdAt <= :endTime " +
           "AND m.channelType = :channelType")
    List<MetricsLatency> findByTimeRangeAndChannel(@Param("startTime") LocalDateTime startTime,
                                                    @Param("endTime") LocalDateTime endTime,
                                                    @Param("channelType") String channelType);

    @Query("SELECT AVG(m.latencyMs) FROM MetricsLatency m WHERE m.createdAt >= :startTime AND m.createdAt <= :endTime")
    Long findAverageLatencyByTimeRange(@Param("startTime") LocalDateTime startTime,
                                        @Param("endTime") LocalDateTime endTime);

    @Query("SELECT AVG(m.latencyMs) FROM MetricsLatency m WHERE m.createdAt >= :startTime AND m.createdAt <= :endTime " +
           "AND m.channelType = :channelType")
    Long findAverageLatencyByTimeRangeAndChannel(@Param("startTime") LocalDateTime startTime,
                                                  @Param("endTime") LocalDateTime endTime,
                                                  @Param("channelType") String channelType);

    @Query("SELECT MAX(m.latencyMs) FROM MetricsLatency m WHERE m.createdAt >= :startTime AND m.createdAt <= :endTime")
    Long findMaxLatencyByTimeRange(@Param("startTime") LocalDateTime startTime,
                                    @Param("endTime") LocalDateTime endTime);

    @Query("SELECT m.latencyMs FROM MetricsLatency m WHERE m.createdAt >= :startTime AND m.createdAt <= :endTime " +
           "AND m.channelType = :channelType ORDER BY m.latencyMs")
    List<Long> findLatenciesByTimeRangeAndChannelOrdered(@Param("startTime") LocalDateTime startTime,
                                                           @Param("endTime") LocalDateTime endTime,
                                                           @Param("channelType") String channelType);
}
