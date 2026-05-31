package com.message.gateway.service;

import com.message.gateway.config.GatewayProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RateLimitServiceTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @Mock
    private GatewayProperties gatewayProperties;

    @Mock
    private GatewayProperties.RateLimit rateLimit;

    @InjectMocks
    private RateLimitService rateLimitService;

    @BeforeEach
    void setUp() {
        when(gatewayProperties.getRateLimit()).thenReturn(rateLimit);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void testTryAcquire_WhenDisabled_ReturnsTrue() {
        when(rateLimit.isEnabled()).thenReturn(false);

        boolean result = rateLimitService.tryAcquire("business123");

        assertTrue(result);
        verify(valueOperations, never()).increment(any());
    }

    @Test
    void testTryAcquire_WhenUnderLimit_ReturnsTrue() {
        when(rateLimit.isEnabled()).thenReturn(true);
        when(rateLimit.getDefaultLimit()).thenReturn(100);
        when(valueOperations.increment(any())).thenReturn(1L);

        boolean result = rateLimitService.tryAcquire("business123");

        assertTrue(result);
        verify(valueOperations).increment(eq("rate_limit:business123"));
    }

    @Test
    void testTryAcquire_WhenOverLimit_ReturnsFalse() {
        when(rateLimit.isEnabled()).thenReturn(true);
        when(rateLimit.getDefaultLimit()).thenReturn(100);
        when(valueOperations.increment(any())).thenReturn(101L);

        boolean result = rateLimitService.tryAcquire("business123");

        assertFalse(result);
    }
}
