package com.message.gateway.provider;

import com.message.gateway.config.GatewayProperties;
import com.message.gateway.entity.Message;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Component
public class DefaultPushProvider implements MessageProvider {

    @Autowired
    private GatewayProperties gatewayProperties;

    @Autowired
    private RestTemplate restTemplate;

    @Override
    public String getName() {
        return "DefaultPush";
    }

    @Override
    public boolean supports(String channelType) {
        return "PUSH".equalsIgnoreCase(channelType);
    }

    @Override
    public int getPriority() {
        GatewayProperties.ChannelConfig pushConfig = gatewayProperties.getChannels().get("push");
        if (pushConfig != null && pushConfig.getProviders() != null) {
            GatewayProperties.ProviderConfig provider = pushConfig.getProviders().get("default");
            if (provider != null) {
                return provider.getPriority();
            }
        }
        return 1;
    }

    @Override
    public boolean isEnabled() {
        GatewayProperties.ChannelConfig pushConfig = gatewayProperties.getChannels().get("push");
        if (pushConfig != null && pushConfig.getProviders() != null) {
            GatewayProperties.ProviderConfig provider = pushConfig.getProviders().get("default");
            if (provider != null) {
                return provider.isEnabled();
            }
        }
        return true;
    }

    @Override
    @CircuitBreaker(name = "pushDefault", fallbackMethod = "fallback")
    @Retry(name = "pushSend")
    public boolean send(Message message) throws Exception {
        GatewayProperties.ChannelConfig pushConfig = gatewayProperties.getChannels().get("push");
        if (pushConfig == null || pushConfig.getProviders() == null) {
            throw new IllegalStateException("Push provider not configured");
        }

        GatewayProperties.ProviderConfig provider = pushConfig.getProviders().get("default");
        if (provider == null || provider.getApiUrl() == null) {
            throw new IllegalStateException("Push provider URL not configured");
        }

        Map<String, Object> body = new HashMap<>();
        body.put("deviceId", message.getRecipient());
        body.put("title", message.getSubject() != null ? message.getSubject() : "Notification");
        body.put("body", message.getContent());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (provider.getApiKey() != null && !provider.getApiKey().isEmpty()) {
            headers.set("Authorization", "Bearer " + provider.getApiKey());
        }

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
        ResponseEntity<String> response = restTemplate.exchange(
                provider.getApiUrl(), HttpMethod.POST, request, String.class);

        return response.getStatusCode().is2xxSuccessful();
    }

    public boolean fallback(Message message, Exception ex) {
        return false;
    }
}
