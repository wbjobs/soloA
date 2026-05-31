package com.message.gateway.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class TemplateEngineService {

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\$\\{([^}]+)\\}");

    public String render(String template, Map<String, Object> variables) {
        if (template == null || template.isEmpty()) {
            return template;
        }

        if (variables == null || variables.isEmpty()) {
            return template;
        }

        StringBuffer result = new StringBuffer();
        Matcher matcher = VARIABLE_PATTERN.matcher(template);

        while (matcher.find()) {
            String variableName = matcher.group(1).trim();
            Object value = getNestedValue(variables, variableName);
            String replacement = (value != null) ? Matcher.quoteReplacement(value.toString()) : "";
            matcher.appendReplacement(result, replacement);
        }
        matcher.appendTail(result);

        return result.toString();
    }

    private Object getNestedValue(Map<String, Object> variables, String path) {
        if (path == null || path.isEmpty()) {
            return null;
        }

        String[] parts = path.split("\\.");
        Object current = variables;

        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<?, ?>) current).get(part);
            } else {
                return null;
            }

            if (current == null) {
                return null;
            }
        }

        return current;
    }

    public String renderWithDefault(String template, Map<String, Object> variables, String defaultValue) {
        String result = render(template, variables);
        if (result == null || result.isEmpty()) {
            return defaultValue;
        }
        return result;
    }
}
