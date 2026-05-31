package com.message.gateway.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import java.util.Map;

@Data
public class MessageRequest {

    @NotBlank(message = "业务方ID不能为空")
    private String businessId;

    @NotBlank(message = "渠道类型不能为空")
    private String channelType;

    @NotBlank(message = "接收者不能为空")
    private String recipient;

    private String subject;

    private String content;

    private String callbackUrl;

    private String templateCode;

    private Map<String, Object> templateVariables;
}
