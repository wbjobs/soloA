package com.message.gateway.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Map;

@Data
@Component
@ConfigurationProperties(prefix = "message.gateway")
public class GatewayProperties {

    private RateLimit rateLimit = new RateLimit();
    private Callback callback = new Callback();
    private Map<String, ChannelConfig> channels;

    @Data
    public static class RateLimit {
        private boolean enabled = true;
        private int defaultLimit = 100;
        private int windowSeconds = 60;
    }

    @Data
    public static class Callback {
        private int retryCount = 3;
        private int retryIntervalMs = 5000;
    }

    @Data
    public static class ChannelConfig {
        private Map<String, ProviderConfig> providers;
    }

    @Data
    public static class ProviderConfig {
        private String name;
        private boolean enabled = true;
        private int priority = 1;
        private String apiUrl;
        private String apiKey;
    }
}
