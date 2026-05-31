package com.message.gateway.repository;

import com.message.gateway.entity.MetricsStats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface MetricsStatsRepository extends JpaRepository<MetricsStats, Long> {

    Optional<MetricsStats> findByStatDateAndStatHourAndChannelTypeAndProviderNameAndBusinessId(
            LocalDate statDate, Integer statHour, String channelType, String providerName, String businessId);

    List<MetricsStats> findByStatDate(LocalDate statDate);

    List<MetricsStats> findByStatDateAndChannelType(LocalDate statDate, String channelType);

    @Query("SELECT m FROM MetricsStats m WHERE m.statDate >= :startDate AND m.statDate <= :endDate")
    List<MetricsStats> findByDateRange(@Param("startDate") LocalDate startDate,
                                        @Param("endDate") LocalDate endDate);

    @Query("SELECT m FROM MetricsStats m WHERE m.statDate >= :startDate AND m.statDate <= :endDate " +
           "AND m.channelType = :channelType")
    List<MetricsStats> findByDateRangeAndChannel(@Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate,
                                                  @Param("channelType") String channelType);

    @Query("SELECT m FROM MetricsStats m WHERE m.statDate = :statDate AND m.statHour IS NULL")
    List<MetricsStats> findDailyStatsByDate(@Param("statDate") LocalDate statDate);

    @Query("SELECT m FROM MetricsStats m WHERE m.statDate = :statDate AND m.statHour IS NOT NULL")
    List<MetricsStats> findHourlyStatsByDate(@Param("statDate") LocalDate statDate);

    @Query("SELECT m FROM MetricsStats m WHERE m.statDate >= :startDate AND m.statDate <= :endDate " +
           "AND m.statHour IS NULL")
    List<MetricsStats> findDailyStatsByDateRange(@Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate);
}
