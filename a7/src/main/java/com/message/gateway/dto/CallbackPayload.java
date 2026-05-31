package com.message.gateway.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CallbackPayload {

    private String messageId;
    private String businessId;
    private String channelType;
    private String status;
    private String providerName;
    private String errorMessage;
    private LocalDateTime sentAt;
}
