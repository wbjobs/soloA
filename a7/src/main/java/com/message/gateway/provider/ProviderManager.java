package com.message.gateway.provider;

import com.message.gateway.entity.Message;
import com.message.gateway.entity.MessageLog;
import com.message.gateway.enums.MessageStatus;
import com.message.gateway.repository.MessageLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Component
public class ProviderManager {

    @Autowired
    private List<MessageProvider> providers;

    @Autowired
    private MessageLogRepository messageLogRepository;

    public String sendMessageWithFailover(Message message) throws Exception {
        List<MessageProvider> availableProviders = getSortedProviders(message.getChannelType().name());
        
        if (availableProviders.isEmpty()) {
            throw new IllegalStateException("No available providers for channel: " + message.getChannelType());
        }

        Exception lastException = null;
        
        for (MessageProvider provider : availableProviders) {
            try {
                log.info("Attempting to send message {} via provider {}", message.getMessageId(), provider.getName());
                
                boolean success = provider.send(message);
                
                if (success) {
                    log.info("Message {} sent successfully via provider {}", message.getMessageId(), provider.getName());
                    logSendAttempt(message, provider.getName(), MessageStatus.SUCCESS, null, null);
                    return provider.getName();
                } else {
                    log.warn("Provider {} failed to send message {}, trying next provider", 
                            provider.getName(), message.getMessageId());
                    logSendAttempt(message, provider.getName(), MessageStatus.FAILED, 
                            "Provider returned failure", null);
                }
            } catch (Exception e) {
                log.error("Error sending message {} via provider {}: {}", 
                        message.getMessageId(), provider.getName(), e.getMessage());
                lastException = e;
                logSendAttempt(message, provider.getName(), MessageStatus.FAILED, e.getMessage(), null);
            }
        }

        if (lastException != null) {
            throw lastException;
        }
        
        throw new Exception("All providers failed to send message: " + message.getMessageId());
    }

    private List<MessageProvider> getSortedProviders(String channelType) {
        return providers.stream()
                .filter(p -> p.supports(channelType) && p.isEnabled())
                .sorted(Comparator.comparingInt(MessageProvider::getPriority))
                .collect(Collectors.toList());
    }

    private void logSendAttempt(Message message, String providerName, MessageStatus status, 
                                 String errorMessage, String response) {
        MessageLog log = new MessageLog();
        log.setMessageId(message.getMessageId());
        log.setProviderName(providerName);
        log.setStatus(status);
        log.setErrorMessage(errorMessage);
        log.setResponse(response);
        messageLogRepository.save(log);
    }

    public List<MessageProvider> getProviders() {
        return new ArrayList<>(providers);
    }
}
