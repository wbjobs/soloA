package com.message.gateway.entity;

import com.message.gateway.enums.ChannelType;
import com.message.gateway.enums.MessageStatus;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "messages", indexes = {
    @Index(name = "idx_business_id", columnList = "business_id"),
    @Index(name = "idx_status", columnList = "status"),
    @Index(name = "idx_channel_type", columnList = "channel_type"),
    @Index(name = "idx_created_at", columnList = "created_at")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", unique = true, nullable = false, length = 64)
    private String messageId;

    @Column(name = "business_id", nullable = false, length = 64)
    private String businessId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel_type", nullable = false, length = 20)
    private ChannelType channelType;

    @Column(name = "provider_name", length = 50)
    private String providerName;

    @Column(nullable = false, length = 255)
    private String recipient;

    @Column(length = 255)
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageStatus status = MessageStatus.PENDING;

    @Column(name = "callback_url", length = 500)
    private String callbackUrl;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "retry_count")
    private Integer retryCount = 0;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
