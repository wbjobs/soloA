package com.message.gateway.service;

import com.message.gateway.config.RabbitMQConfig;
import com.message.gateway.entity.Message;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MessageProducer {

    @Autowired
    private RabbitTemplate rabbitTemplate;

    public void sendToQueue(Message message) {
        String routingKey;
        switch (message.getChannelType()) {
            case EMAIL:
                routingKey = RabbitMQConfig.EMAIL_ROUTING_KEY;
                break;
            case SMS:
                routingKey = RabbitMQConfig.SMS_ROUTING_KEY;
                break;
            case PUSH:
                routingKey = RabbitMQConfig.PUSH_ROUTING_KEY;
                break;
            default:
                throw new IllegalArgumentException("Unknown channel type: " + message.getChannelType());
        }
        
        rabbitTemplate.convertAndSend(RabbitMQConfig.EXCHANGE_NAME, routingKey, message);
    }

    public void sendCallback(Message message) {
        rabbitTemplate.convertAndSend(RabbitMQConfig.EXCHANGE_NAME, 
                RabbitMQConfig.CALLBACK_ROUTING_KEY, message);
    }
}
