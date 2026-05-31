package com.message.gateway.consumer;

import com.message.gateway.entity.Message;
import com.message.gateway.enums.MessageStatus;
import com.message.gateway.provider.ProviderManager;
import com.message.gateway.repository.MessageRepository;
import com.message.gateway.service.CallbackService;
import com.message.gateway.service.MessageProducer;
import com.message.gateway.service.MetricsCollectorService;
import com.rabbitmq.client.Channel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Component
public class MessageConsumer {

    @Autowired
    private ProviderManager providerManager;

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private MessageProducer messageProducer;

    @Autowired
    private CallbackService callbackService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private MetricsCollectorService metricsCollectorService;

    @RabbitListener(queues = "message.gateway.email")
    public void handleEmailMessage(Message message, Channel channel,
                                    @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        processMessage(message, channel, deliveryTag);
    }

    @RabbitListener(queues = "message.gateway.sms")
    public void handleSmsMessage(Message message, Channel channel,
                                  @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        processMessage(message, channel, deliveryTag);
    }

    @RabbitListener(queues = "message.gateway.push")
    public void handlePushMessage(Message message, Channel channel,
                                   @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        processMessage(message, channel, deliveryTag);
    }

    @RabbitListener(queues = "message.gateway.callback")
    public void handleCallbackMessage(Message message, Channel channel,
                                       @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag) {
        log.info("Processing callback for message {}", message.getMessageId());
        try {
            callbackService.notifyCallback(message);
            log.info("Callback processed for message {}", message.getMessageId());
            basicAck(channel, deliveryTag);
        } catch (Exception e) {
            log.error("Error processing callback for message {}: {}",
                    message.getMessageId(), e.getMessage());
            basicNack(channel, deliveryTag, false);
        }
    }

    private void processMessage(Message message, Channel channel, long deliveryTag) {
        log.info("Processing message {} via channel {}",
                message.getMessageId(), message.getChannelType());

        LocalDateTime startTime = LocalDateTime.now();
        String channelType = message.getChannelType().name();
        String businessId = message.getBusinessId();

        DefaultTransactionDefinition transactionDef = new DefaultTransactionDefinition();
        transactionDef.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactionDef.setTimeout(30);
        TransactionStatus transactionStatus = transactionManager.getTransaction(transactionDef);

        String providerName = null;
        boolean success = false;
        Exception processingException = null;

        try {
            messageRepository.updateStatus(message.getMessageId(), MessageStatus.SENDING, null, message.getRetryCount());
            transactionManager.commit(transactionStatus);

            providerName = providerManager.sendMessageWithFailover(message);
            success = true;

            transactionStatus = transactionManager.getTransaction(transactionDef);
            try {
                messageRepository.updateSuccessStatus(message.getMessageId(), providerName, MessageStatus.SUCCESS);
                transactionManager.commit(transactionStatus);
            } catch (Exception e) {
                transactionManager.rollback(transactionStatus);
                throw e;
            }

            Optional<Message> updatedMessageOpt = messageRepository.findByMessageId(message.getMessageId());
            if (updatedMessageOpt.isPresent() && updatedMessageOpt.get().getCallbackUrl() != null
                    && !updatedMessageOpt.get().getCallbackUrl().isEmpty()) {
                messageProducer.sendCallback(updatedMessageOpt.get());
            }

            basicAck(channel, deliveryTag);
            log.info("Message {} processed successfully", message.getMessageId());

        } catch (Exception e) {
            log.error("Error processing message {}: {}", message.getMessageId(), e.getMessage());
            processingException = e;
            handleProcessingFailure(message, channel, deliveryTag, e);
        } finally {
            long latencyMs = java.time.Duration.between(startTime, LocalDateTime.now()).toMillis();
            
            if (success) {
                metricsCollectorService.recordSuccess(channelType, providerName, businessId, latencyMs);
            } else {
                metricsCollectorService.recordFailure(channelType, providerName, businessId, latencyMs);
            }
        }
    }

    private void handleProcessingFailure(Message message, Channel channel, long deliveryTag, Exception e) {
        String errorMessage = e.getMessage();
        boolean shouldRequeue = false;
        int newRetryCount = message.getRetryCount() + 1;

        DefaultTransactionDefinition transactionDef = new DefaultTransactionDefinition();
        transactionDef.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactionDef.setTimeout(10);
        TransactionStatus transactionStatus = transactionManager.getTransaction(transactionDef);

        try {
            if (newRetryCount < 3) {
                messageRepository.updateStatus(message.getMessageId(), MessageStatus.PENDING, errorMessage, newRetryCount);
                shouldRequeue = true;
                log.info("Message {} will be requeued for retry (attempt {})", message.getMessageId(), newRetryCount);
            } else {
                messageRepository.updateStatus(message.getMessageId(), MessageStatus.FAILED, errorMessage, message.getRetryCount());
                log.warn("Message {} failed after 3 attempts, marked as FAILED", message.getMessageId());
            }
            transactionManager.commit(transactionStatus);
        } catch (Exception dbException) {
            transactionManager.rollback(transactionStatus);
            log.error("Error updating message status for {}: {}", message.getMessageId(), dbException.getMessage());
        }

        try {
            Optional<Message> updatedMessageOpt = messageRepository.findByMessageId(message.getMessageId());
            if (updatedMessageOpt.isPresent() && updatedMessageOpt.get().getCallbackUrl() != null
                    && !updatedMessageOpt.get().getCallbackUrl().isEmpty()) {
                messageProducer.sendCallback(updatedMessageOpt.get());
            }
        } catch (Exception callbackException) {
            log.error("Error scheduling callback for message {}: {}", message.getMessageId(), callbackException.getMessage());
        }

        if (shouldRequeue) {
            basicNack(channel, deliveryTag, true);
        } else {
            basicNack(channel, deliveryTag, false);
        }
    }

    private void basicAck(Channel channel, long deliveryTag) {
        try {
            if (channel != null && channel.isOpen()) {
                channel.basicAck(deliveryTag, false);
            } else {
                log.warn("Channel is null or closed, cannot ack message with tag {}", deliveryTag);
            }
        } catch (IOException e) {
            log.error("Error acknowledging message with tag {}: {}", deliveryTag, e.getMessage());
        }
    }

    private void basicNack(Channel channel, long deliveryTag, boolean requeue) {
        try {
            if (channel != null && channel.isOpen()) {
                channel.basicNack(deliveryTag, false, requeue);
                log.info("Message with tag {} nacked, requeue={}", deliveryTag, requeue);
            } else {
                log.warn("Channel is null or closed, cannot nack message with tag {}", deliveryTag);
            }
        } catch (IOException e) {
            log.error("Error nacking message with tag {}: {}", deliveryTag, e.getMessage());
        }
    }
}
