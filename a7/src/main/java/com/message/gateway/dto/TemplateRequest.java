package com.message.gateway.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class TemplateRequest {

    @NotBlank(message = "模板编码不能为空")
    private String templateCode;

    @NotBlank(message = "模板名称不能为空")
    private String templateName;

    private String businessId;

    @NotBlank(message = "渠道类型不能为空")
    private String channelType;

    private String subjectTemplate;

    @NotBlank(message = "内容模板不能为空")
    private String contentTemplate;

    private String variables;

    private String status;
}
