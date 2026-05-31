package com.message.gateway.service;

import com.message.gateway.dto.MessageRequest;
import com.message.gateway.dto.MessageResponse;
import com.message.gateway.entity.Message;
import com.message.gateway.enums.ChannelType;
import com.message.gateway.repository.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private RateLimitService rateLimitService;

    @Mock
    private MessageProducer messageProducer;

    @InjectMocks
    private MessageService messageService;

    private MessageRequest validRequest;

    @BeforeEach
    void setUp() {
        validRequest = new MessageRequest();
        validRequest.setBusinessId("business123");
        validRequest.setChannelType("EMAIL");
        validRequest.setRecipient("test@example.com");
        validRequest.setSubject("Test Subject");
        validRequest.setContent("Test Content");
        validRequest.setCallbackUrl("http://localhost:8080/callback");
    }

    @Test
    void testSendMessage_WhenRateLimited_ReturnsRateLimitedStatus() {
        when(rateLimitService.tryAcquire(any())).thenReturn(false);

        MessageResponse response = messageService.sendMessage(validRequest);

        assertEquals("RATE_LIMITED", response.getStatus());
        verify(messageRepository, never()).save(any());
        verify(messageProducer, never()).sendToQueue(any());
    }

    @Test
    void testSendMessage_WhenSuccess_ReturnsAcceptedStatus() {
        when(rateLimitService.tryAcquire(any())).thenReturn(true);
        when(messageRepository.save(any(Message.class))).thenAnswer(i -> i.getArgument(0));

        MessageResponse response = messageService.sendMessage(validRequest);

        assertEquals("ACCEPTED", response.getStatus());
        assertNotNull(response.getMessageId());
        verify(messageRepository).save(any(Message.class));
        verify(messageProducer).sendToQueue(any(Message.class));
    }

    @Test
    void testGetMessage_WhenFound_ReturnsMessage() {
        Message message = new Message();
        message.setMessageId("msg123");
        message.setChannelType(ChannelType.EMAIL);

        when(messageRepository.findByMessageId("msg123")).thenReturn(java.util.Optional.of(message));

        Message result = messageService.getMessage("msg123");

        assertNotNull(result);
        assertEquals("msg123", result.getMessageId());
    }

    @Test
    void testGetMessage_WhenNotFound_ReturnsNull() {
        when(messageRepository.findByMessageId("nonexistent")).thenReturn(java.util.Optional.empty());

        Message result = messageService.getMessage("nonexistent");

        assertNull(result);
    }
}
