package com.message.gateway.entity;

import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import javax.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "metrics_stats", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"stat_date", "stat_hour", "channel_type", "provider_name", "business_id"})
}, indexes = {
    @Index(name = "idx_stat_date", columnList = "stat_date"),
    @Index(name = "idx_metrics_channel_type", columnList = "channel_type")
})
public class MetricsStats {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stat_date", nullable = false)
    private LocalDate statDate;

    @Column(name = "stat_hour")
    private Integer statHour;

    @Column(name = "channel_type", nullable = false, length = 20)
    private String channelType;

    @Column(name = "provider_name", length = 50)
    private String providerName;

    @Column(name = "business_id", length = 64)
    private String businessId;

    @Column(name = "total_count", nullable = false)
    private Integer totalCount = 0;

    @Column(name = "success_count", nullable = false)
    private Integer successCount = 0;

    @Column(name = "failed_count", nullable = false)
    private Integer failedCount = 0;

    @Column(name = "avg_latency_ms", nullable = false)
    private Long avgLatencyMs = 0L;

    @Column(name = "max_latency_ms", nullable = false)
    private Long maxLatencyMs = 0L;

    @Column(name = "p95_latency_ms", nullable = false)
    private Long p95LatencyMs = 0L;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
