package com.message.gateway.provider;

import com.message.gateway.config.GatewayProperties;
import com.message.gateway.entity.Message;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpEmailProvider implements MessageProvider {

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private GatewayProperties gatewayProperties;

    @Override
    public String getName() {
        return "SMTP";
    }

    @Override
    public boolean supports(String channelType) {
        return "EMAIL".equalsIgnoreCase(channelType);
    }

    @Override
    public int getPriority() {
        GatewayProperties.ChannelConfig emailConfig = gatewayProperties.getChannels().get("email");
        if (emailConfig != null && emailConfig.getProviders() != null) {
            GatewayProperties.ProviderConfig provider = emailConfig.getProviders().get("smtp");
            if (provider != null) {
                return provider.getPriority();
            }
        }
        return 1;
    }

    @Override
    public boolean isEnabled() {
        GatewayProperties.ChannelConfig emailConfig = gatewayProperties.getChannels().get("email");
        if (emailConfig != null && emailConfig.getProviders() != null) {
            GatewayProperties.ProviderConfig provider = emailConfig.getProviders().get("smtp");
            if (provider != null) {
                return provider.isEnabled();
            }
        }
        return true;
    }

    @Override
    @CircuitBreaker(name = "emailSmtp", fallbackMethod = "fallback")
    @Retry(name = "emailSend")
    public boolean send(Message message) throws Exception {
        SimpleMailMessage mailMessage = new SimpleMailMessage();
        mailMessage.setTo(message.getRecipient());
        mailMessage.setSubject(message.getSubject() != null ? message.getSubject() : "Notification");
        mailMessage.setText(message.getContent());
        mailSender.send(mailMessage);
        return true;
    }

    public boolean fallback(Message message, Exception ex) {
        return false;
    }
}
