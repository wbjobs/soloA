package com.message.gateway.entity;

import com.message.gateway.enums.ChannelType;
import com.message.gateway.enums.TemplateStatus;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "message_templates", indexes = {
    @Index(name = "idx_business_id", columnList = "business_id"),
    @Index(name = "idx_channel_type", columnList = "channel_type"),
    @Index(name = "idx_status", columnList = "status")
})
public class MessageTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "template_code", unique = true, nullable = false, length = 64)
    private String templateCode;

    @Column(name = "template_name", nullable = false, length = 100)
    private String templateName;

    @Column(name = "business_id", length = 64)
    private String businessId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel_type", nullable = false, length = 20)
    private ChannelType channelType;

    @Column(name = "subject_template", length = 255)
    private String subjectTemplate;

    @Column(name = "content_template", nullable = false, columnDefinition = "TEXT")
    private String contentTemplate;

    @Column(columnDefinition = "TEXT")
    private String variables;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TemplateStatus status = TemplateStatus.ACTIVE;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "created_by", length = 64)
    private String createdBy;
}
