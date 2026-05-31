package com.message.gateway.provider;

import com.message.gateway.config.GatewayProperties;
import com.message.gateway.entity.Message;
import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SendGridEmailProvider implements MessageProvider {

    @Autowired
    private GatewayProperties gatewayProperties;

    @Value("${message.gateway.channels.email.providers.sendgrid.api-key:}")
    private String apiKey;

    @Override
    public String getName() {
        return "SendGrid";
    }

    @Override
    public boolean supports(String channelType) {
        return "EMAIL".equalsIgnoreCase(channelType);
    }

    @Override
    public int getPriority() {
        GatewayProperties.ChannelConfig emailConfig = gatewayProperties.getChannels().get("email");
        if (emailConfig != null && emailConfig.getProviders() != null) {
            GatewayProperties.ProviderConfig provider = emailConfig.getProviders().get("sendgrid");
            if (provider != null) {
                return provider.getPriority();
            }
        }
        return 2;
    }

    @Override
    public boolean isEnabled() {
        GatewayProperties.ChannelConfig emailConfig = gatewayProperties.getChannels().get("email");
        if (emailConfig != null && emailConfig.getProviders() != null) {
            GatewayProperties.ProviderConfig provider = emailConfig.getProviders().get("sendgrid");
            if (provider != null) {
                return provider.isEnabled();
            }
        }
        return true;
    }

    @Override
    @CircuitBreaker(name = "emailSendGrid", fallbackMethod = "fallback")
    @Retry(name = "emailSend")
    public boolean send(Message message) throws Exception {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("SendGrid API key not configured");
        }

        Email from = new Email("no-reply@example.com");
        String subject = message.getSubject() != null ? message.getSubject() : "Notification";
        Email to = new Email(message.getRecipient());
        Content content = new Content("text/plain", message.getContent());
        Mail mail = new Mail(from, subject, to, content);

        SendGrid sg = new SendGrid(apiKey);
        Request request = new Request();
        request.setMethod(Method.POST);
        request.setEndpoint("mail/send");
        request.setBody(mail.build());

        Response response = sg.api(request);
        return response.getStatusCode() >= 200 && response.getStatusCode() < 300;
    }

    public boolean fallback(Message message, Exception ex) {
        return false;
    }
}
