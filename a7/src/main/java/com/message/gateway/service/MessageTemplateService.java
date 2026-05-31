package com.message.gateway.service;

import com.message.gateway.dto.TemplateRenderRequest;
import com.message.gateway.dto.TemplateRenderResult;
import com.message.gateway.dto.TemplateRequest;
import com.message.gateway.entity.MessageTemplate;
import com.message.gateway.enums.ChannelType;
import com.message.gateway.enums.TemplateStatus;
import com.message.gateway.repository.MessageTemplateRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Slf4j
@Service
public class MessageTemplateService {

    @Autowired
    private MessageTemplateRepository templateRepository;

    @Autowired
    private TemplateEngineService templateEngineService;

    @Transactional
    public MessageTemplate createTemplate(TemplateRequest request) {
        if (templateRepository.findByTemplateCode(request.getTemplateCode()).isPresent()) {
            throw new IllegalArgumentException("模板编码已存在: " + request.getTemplateCode());
        }

        MessageTemplate template = new MessageTemplate();
        template.setTemplateCode(request.getTemplateCode());
        template.setTemplateName(request.getTemplateName());
        template.setBusinessId(request.getBusinessId());
        template.setChannelType(ChannelType.valueOf(request.getChannelType().toUpperCase()));
        template.setSubjectTemplate(request.getSubjectTemplate());
        template.setContentTemplate(request.getContentTemplate());
        template.setVariables(request.getVariables());
        template.setStatus(request.getStatus() != null ? 
                TemplateStatus.valueOf(request.getStatus().toUpperCase()) : TemplateStatus.ACTIVE);

        return templateRepository.save(template);
    }

    @Transactional
    public MessageTemplate updateTemplate(Long id, TemplateRequest request) {
        MessageTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("模板不存在: " + id));

        if (request.getTemplateName() != null) {
            template.setTemplateName(request.getTemplateName());
        }
        if (request.getChannelType() != null) {
            template.setChannelType(ChannelType.valueOf(request.getChannelType().toUpperCase()));
        }
        if (request.getSubjectTemplate() != null) {
            template.setSubjectTemplate(request.getSubjectTemplate());
        }
        if (request.getContentTemplate() != null) {
            template.setContentTemplate(request.getContentTemplate());
        }
        if (request.getVariables() != null) {
            template.setVariables(request.getVariables());
        }
        if (request.getStatus() != null) {
            template.setStatus(TemplateStatus.valueOf(request.getStatus().toUpperCase()));
        }

        return templateRepository.save(template);
    }

    public MessageTemplate getTemplate(Long id) {
        return templateRepository.findById(id).orElse(null);
    }

    public MessageTemplate getTemplateByCode(String code) {
        return templateRepository.findByTemplateCode(code).orElse(null);
    }

    public List<MessageTemplate> getAllTemplates() {
        return templateRepository.findAll();
    }

    public List<MessageTemplate> getTemplatesByBusiness(String businessId) {
        return templateRepository.findByBusinessId(businessId);
    }

    public List<MessageTemplate> getTemplatesByChannel(String channelType) {
        return templateRepository.findByChannelType(ChannelType.valueOf(channelType.toUpperCase()));
    }

    @Transactional
    public void deleteTemplate(Long id) {
        templateRepository.deleteById(id);
    }

    public TemplateRenderResult renderTemplate(TemplateRenderRequest request) {
        List<MessageTemplate> templates = templateRepository.findActiveByCodeAndBusiness(
                request.getTemplateCode(), request.getBusinessId());

        if (templates.isEmpty()) {
            throw new IllegalArgumentException("模板不存在或已禁用: " + request.getTemplateCode());
        }

        MessageTemplate template = templates.get(0);

        String renderedSubject = null;
        if (template.getSubjectTemplate() != null) {
            renderedSubject = templateEngineService.render(
                    template.getSubjectTemplate(), request.getVariables());
        }

        String renderedContent = templateEngineService.render(
                template.getContentTemplate(), request.getVariables());

        log.info("Template {} rendered successfully for business {}", 
                template.getTemplateCode(), request.getBusinessId());

        return TemplateRenderResult.builder()
                .subject(renderedSubject)
                .content(renderedContent)
                .templateCode(template.getTemplateCode())
                .build();
    }

    public TemplateRenderResult renderTemplateByCode(String templateCode, String businessId, 
                                                      java.util.Map<String, Object> variables) {
        TemplateRenderRequest request = new TemplateRenderRequest();
        request.setTemplateCode(templateCode);
        request.setBusinessId(businessId);
        request.setVariables(variables);
        return renderTemplate(request);
    }
}
