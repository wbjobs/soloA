package com.message.gateway.entity;

import com.message.gateway.enums.MessageStatus;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "message_logs", indexes = {
    @Index(name = "idx_message_id", columnList = "message_id"),
    @Index(name = "idx_created_at", columnList = "created_at")
})
public class MessageLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false, length = 64)
    private String messageId;

    @Column(name = "provider_name", nullable = false, length = 50)
    private String providerName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageStatus status;

    @Column(columnDefinition = "TEXT")
    private String response;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
