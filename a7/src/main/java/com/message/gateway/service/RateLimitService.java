package com.message.gateway.service;

import com.message.gateway.config.GatewayProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
public class RateLimitService {

    private static final String RATE_LIMIT_KEY_PREFIX = "rate_limit:";

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private GatewayProperties gatewayProperties;

    public boolean tryAcquire(String businessId) {
        if (!gatewayProperties.getRateLimit().isEnabled()) {
            return true;
        }

        String key = RATE_LIMIT_KEY_PREFIX + businessId;
        int limit = gatewayProperties.getRateLimit().getDefaultLimit();
        int windowSeconds = gatewayProperties.getRateLimit().getWindowSeconds();

        Long count = redisTemplate.opsForValue().increment(key);
        
        if (count == null || count == 1) {
            redisTemplate.expire(key, windowSeconds, TimeUnit.SECONDS);
        }

        return count != null && count <= limit;
    }

    public Long getRemainingRequests(String businessId) {
        if (!gatewayProperties.getRateLimit().isEnabled()) {
            return Long.MAX_VALUE;
        }

        String key = RATE_LIMIT_KEY_PREFIX + businessId;
        int limit = gatewayProperties.getRateLimit().getDefaultLimit();
        
        Long count = (Long) redisTemplate.opsForValue().get(key);
        if (count == null) {
            return (long) limit;
        }
        
        return Math.max(0, limit - count);
    }
}
