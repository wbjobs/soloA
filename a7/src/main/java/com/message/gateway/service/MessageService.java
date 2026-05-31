package com.message.gateway.service;

import com.message.gateway.dto.MessageRequest;
import com.message.gateway.dto.MessageResponse;
import com.message.gateway.dto.TemplateRenderResult;
import com.message.gateway.entity.Message;
import com.message.gateway.enums.ChannelType;
import com.message.gateway.enums.MessageStatus;
import com.message.gateway.repository.MessageRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import java.util.UUID;

@Slf4j
@Service
public class MessageService {

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private RateLimitService rateLimitService;

    @Autowired
    private MessageProducer messageProducer;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private MessageTemplateService templateService;

    public MessageResponse sendMessage(MessageRequest request) {
        String businessId = request.getBusinessId();

        if (!rateLimitService.tryAcquire(businessId)) {
            return MessageResponse.builder()
                    .messageId(null)
                    .status("RATE_LIMITED")
                    .message("Rate limit exceeded. Please try again later.")
                    .build();
        }

        String subject = request.getSubject();
        String content = request.getContent();

        if (request.getTemplateCode() != null && !request.getTemplateCode().isEmpty()) {
            try {
                TemplateRenderResult renderResult = templateService.renderTemplateByCode(
                        request.getTemplateCode(),
                        businessId,
                        request.getTemplateVariables()
                );
                if (renderResult.getSubject() != null && !renderResult.getSubject().isEmpty()) {
                    subject = renderResult.getSubject();
                }
                content = renderResult.getContent();
            } catch (Exception e) {
                log.error("Error rendering template {}: {}", request.getTemplateCode(), e.getMessage());
                if (content == null || content.isEmpty()) {
                    return MessageResponse.builder()
                            .messageId(null)
                            .status("TEMPLATE_ERROR")
                            .message("Template rendering failed: " + e.getMessage())
                            .build();
                }
            }
        }

        if (content == null || content.isEmpty()) {
            return MessageResponse.builder()
                    .messageId(null)
                    .status("ERROR")
                    .message("Content is required (either direct content or template)")
                    .build();
        }

        Message message = createMessage(request, subject, content);

        DefaultTransactionDefinition transactionDef = new DefaultTransactionDefinition();
        transactionDef.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactionDef.setTimeout(10);
        TransactionStatus transactionStatus = transactionManager.getTransaction(transactionDef);

        try {
            messageRepository.save(message);
            transactionManager.commit(transactionStatus);
        } catch (Exception e) {
            transactionManager.rollback(transactionStatus);
            log.error("Error saving message to database: {}", e.getMessage());
            return MessageResponse.builder()
                    .messageId(null)
                    .status("ERROR")
                    .message("Failed to save message: " + e.getMessage())
                    .build();
        }

        try {
            messageProducer.sendToQueue(message);
        } catch (Exception e) {
            log.error("Error sending message to queue: {}", e.getMessage());
            return MessageResponse.builder()
                    .messageId(message.getMessageId())
                    .status("PARTIAL_SUCCESS")
                    .message("Message saved but failed to queue for processing")
                    .build();
        }

        log.info("Message {} accepted for business {} via channel {}",
                message.getMessageId(), businessId, request.getChannelType());

        return MessageResponse.builder()
                .messageId(message.getMessageId())
                .status("ACCEPTED")
                .message("Message accepted for processing")
                .build();
    }

    private Message createMessage(MessageRequest request, String subject, String content) {
        Message message = new Message();
        message.setMessageId(UUID.randomUUID().toString().replace("-", ""));
        message.setBusinessId(request.getBusinessId());
        message.setChannelType(ChannelType.valueOf(request.getChannelType().toUpperCase()));
        message.setRecipient(request.getRecipient());
        message.setSubject(subject);
        message.setContent(content);
        message.setCallbackUrl(request.getCallbackUrl());
        message.setStatus(MessageStatus.PENDING);
        message.setRetryCount(0);
        return message;
    }

    public Message getMessage(String messageId) {
        return messageRepository.findByMessageId(messageId)
                .orElse(null);
    }
}
