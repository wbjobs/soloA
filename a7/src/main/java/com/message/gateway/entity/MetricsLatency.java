package com.message.gateway.entity;

import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "metrics_latency", indexes = {
    @Index(name = "idx_latency_message_id", columnList = "message_id"),
    @Index(name = "idx_latency_created_at", columnList = "created_at"),
    @Index(name = "idx_latency_channel_type", columnList = "channel_type")
})
public class MetricsLatency {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false, length = 64)
    private String messageId;

    @Column(name = "channel_type", nullable = false, length = 20)
    private String channelType;

    @Column(name = "provider_name", nullable = false, length = 50)
    private String providerName;

    @Column(name = "business_id", length = 64)
    private String businessId;

    @Column(name = "latency_ms", nullable = false)
    private Long latencyMs;

    @Column(nullable = false, length = 20)
    private String status;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
