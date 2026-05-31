package com.message.gateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.message.gateway.config.GatewayProperties;
import com.message.gateway.dto.CallbackPayload;
import com.message.gateway.entity.CallbackLog;
import com.message.gateway.entity.Message;
import com.message.gateway.enums.MessageStatus;
import com.message.gateway.repository.CallbackLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class CallbackService {

    @Autowired
    private GatewayProperties gatewayProperties;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private CallbackLogRepository callbackLogRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(5);

    @Async
    public void notifyCallback(Message message) {
        if (message.getCallbackUrl() == null || message.getCallbackUrl().isEmpty()) {
            return;
        }

        CallbackPayload payload = CallbackPayload.builder()
                .messageId(message.getMessageId())
                .businessId(message.getBusinessId())
                .channelType(message.getChannelType().name())
                .status(message.getStatus().name())
                .providerName(message.getProviderName())
                .errorMessage(message.getErrorMessage())
                .sentAt(message.getSentAt())
                .build();

        int maxRetries = gatewayProperties.getCallback().getRetryCount();
        int retryIntervalMs = gatewayProperties.getCallback().getRetryIntervalMs();

        executeCallbackWithRetry(message, payload, maxRetries, retryIntervalMs);
    }

    private void executeCallbackWithRetry(Message message, CallbackPayload payload, int maxRetries, int retryIntervalMs) {
        AtomicInteger attempt = new AtomicInteger(0);

        CompletableFuture<Boolean> future = new CompletableFuture<>();
        scheduleCallbackAttempt(message, payload, attempt, maxRetries, retryIntervalMs, future);

        future.whenComplete((success, ex) -> {
            if (ex != null) {
                log.error("Callback execution failed for message {}: {}", message.getMessageId(), ex.getMessage());
            }
        });
    }

    private void scheduleCallbackAttempt(Message message, CallbackPayload payload, AtomicInteger attempt,
                                          int maxRetries, int retryIntervalMs,
                                          CompletableFuture<Boolean> future) {
        int currentAttempt = attempt.incrementAndGet();

        scheduler.schedule(() -> {
            try {
                boolean success = sendCallback(message.getCallbackUrl(), payload, currentAttempt);

                if (success) {
                    logCallback(message, payload, MessageStatus.SUCCESS, currentAttempt - 1, null, null);
                    future.complete(true);
                } else {
                    log.warn("Callback attempt {} returned non-success for message {}", currentAttempt, message.getMessageId());
                    handleCallbackFailure(message, payload, attempt, maxRetries, retryIntervalMs, future, "Non-success status");
                }
            } catch (Exception e) {
                log.error("Callback attempt {} failed for message {}: {}",
                        currentAttempt, message.getMessageId(), e.getMessage());

                logCallback(message, payload, MessageStatus.FAILED, currentAttempt - 1, e.getMessage(), null);

                handleCallbackFailure(message, payload, attempt, maxRetries, retryIntervalMs, future, e.getMessage());
            }
        }, getDelayMs(currentAttempt, retryIntervalMs), TimeUnit.MILLISECONDS);
    }

    private long getDelayMs(int attempt, int baseIntervalMs) {
        if (attempt <= 1) {
            return 0;
        }
        return (long) baseIntervalMs * (long) Math.pow(2, attempt - 2);
    }

    private void handleCallbackFailure(Message message, CallbackPayload payload, AtomicInteger attempt,
                                        int maxRetries, int retryIntervalMs,
                                        CompletableFuture<Boolean> future, String errorMessage) {
        if (attempt.get() <= maxRetries) {
            log.info("Scheduling callback retry {} for message {}", attempt.get() + 1, message.getMessageId());
            scheduleCallbackAttempt(message, payload, attempt, maxRetries, retryIntervalMs, future);
        } else {
            log.error("All callback attempts failed for message {} after {} retries",
                    message.getMessageId(), maxRetries);
            future.complete(false);
        }
    }

    private boolean sendCallback(String callbackUrl, CallbackPayload payload, int attempt) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        String requestBody = objectMapper.writeValueAsString(payload);
        HttpEntity<String> request = new HttpEntity<>(requestBody, headers);

        log.info("Sending callback to {} (attempt {})", callbackUrl, attempt);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    callbackUrl, HttpMethod.POST, request, String.class);

            boolean success = response.getStatusCode().is2xxSuccessful();

            if (success) {
                log.info("Callback successful to {}", callbackUrl);
            } else {
                log.warn("Callback returned non-2xx status: {}, response: {}",
                        response.getStatusCode(),
                        response.getBody());
            }

            return success;
        } catch (Exception e) {
            log.error("HTTP request failed for callback: {}", e.getMessage());
            throw e;
        }
    }

    private void logCallback(Message message, CallbackPayload payload, MessageStatus status,
                              int retryCount, String errorMessage, String responseBody) {
        try {
            CallbackLog log = new CallbackLog();
            log.setMessageId(message.getMessageId());
            log.setCallbackUrl(message.getCallbackUrl());
            log.setRequestBody(objectMapper.writeValueAsString(payload));
            log.setResponseBody(responseBody);
            log.setStatus(status);
            log.setRetryCount(retryCount);
            log.setErrorMessage(errorMessage);
            callbackLogRepository.save(log);
        } catch (Exception e) {
            log.error("Error logging callback: {}", e.getMessage());
        }
    }
}
