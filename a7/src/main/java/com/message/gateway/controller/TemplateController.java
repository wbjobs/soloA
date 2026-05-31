package com.message.gateway.controller;

import com.message.gateway.dto.TemplateRenderRequest;
import com.message.gateway.dto.TemplateRenderResult;
import com.message.gateway.dto.TemplateRequest;
import com.message.gateway.entity.MessageTemplate;
import com.message.gateway.service.MessageTemplateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/templates")
public class TemplateController {

    @Autowired
    private MessageTemplateService templateService;

    @PostMapping
    public ResponseEntity<?> createTemplate(@Valid @RequestBody TemplateRequest request) {
        try {
            MessageTemplate template = templateService.createTemplate(request);
            return ResponseEntity.ok(template);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(createErrorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(createErrorResponse("创建模板失败: " + e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateTemplate(@PathVariable Long id, @RequestBody TemplateRequest request) {
        try {
            MessageTemplate template = templateService.updateTemplate(id, request);
            return ResponseEntity.ok(template);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(createErrorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(createErrorResponse("更新模板失败: " + e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getTemplate(@PathVariable Long id) {
        MessageTemplate template = templateService.getTemplate(id);
        if (template == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(template);
    }

    @GetMapping("/code/{code}")
    public ResponseEntity<?> getTemplateByCode(@PathVariable String code) {
        MessageTemplate template = templateService.getTemplateByCode(code);
        if (template == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(template);
    }

    @GetMapping
    public ResponseEntity<List<MessageTemplate>> getAllTemplates() {
        List<MessageTemplate> templates = templateService.getAllTemplates();
        return ResponseEntity.ok(templates);
    }

    @GetMapping("/business/{businessId}")
    public ResponseEntity<List<MessageTemplate>> getTemplatesByBusiness(@PathVariable String businessId) {
        List<MessageTemplate> templates = templateService.getTemplatesByBusiness(businessId);
        return ResponseEntity.ok(templates);
    }

    @GetMapping("/channel/{channelType}")
    public ResponseEntity<List<MessageTemplate>> getTemplatesByChannel(@PathVariable String channelType) {
        List<MessageTemplate> templates = templateService.getTemplatesByChannel(channelType);
        return ResponseEntity.ok(templates);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteTemplate(@PathVariable Long id) {
        try {
            templateService.deleteTemplate(id);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.status(500).body(createErrorResponse("删除模板失败: " + e.getMessage()));
        }
    }

    @PostMapping("/render")
    public ResponseEntity<?> renderTemplate(@Valid @RequestBody TemplateRenderRequest request) {
        try {
            TemplateRenderResult result = templateService.renderTemplate(request);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(createErrorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(createErrorResponse("渲染模板失败: " + e.getMessage()));
        }
    }

    private Map<String, Object> createErrorResponse(String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "ERROR");
        response.put("message", message);
        return response;
    }
}
