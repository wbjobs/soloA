package com.message.gateway.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import java.util.Map;

@Data
public class TemplateRenderRequest {

    @NotBlank(message = "模板编码不能为空")
    private String templateCode;

    private String businessId;

    private Map<String, Object> variables;
}
