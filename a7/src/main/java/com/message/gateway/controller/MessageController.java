package com.message.gateway.controller;

import com.message.gateway.dto.MessageRequest;
import com.message.gateway.dto.MessageResponse;
import com.message.gateway.entity.Message;
import com.message.gateway.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

@RestController
@RequestMapping("/api/v1/messages")
public class MessageController {

    @Autowired
    private MessageService messageService;

    @PostMapping("/send")
    public ResponseEntity<MessageResponse> sendMessage(@Valid @RequestBody MessageRequest request) {
        try {
            MessageResponse response = messageService.sendMessage(request);
            if ("RATE_LIMITED".equals(response.getStatus())) {
                return ResponseEntity.status(429).body(response);
            }
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(MessageResponse.builder()
                            .status("ERROR")
                            .message(e.getMessage())
                            .build());
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(MessageResponse.builder()
                            .status("ERROR")
                            .message("Internal server error: " + e.getMessage())
                            .build());
        }
    }

    @GetMapping("/{messageId}")
    public ResponseEntity<?> getMessageStatus(@PathVariable String messageId) {
        Message message = messageService.getMessage(messageId);
        if (message == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(message);
    }
}
