package com.message.gateway.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.interceptor.RetryInterceptorBuilder;
import org.springframework.retry.interceptor.RetryOperationsInterceptor;

@Configuration
public class RabbitMQConfig {

    public static final String EXCHANGE_NAME = "message.gateway.exchange";
    public static final String EMAIL_QUEUE = "message.gateway.email";
    public static final String SMS_QUEUE = "message.gateway.sms";
    public static final String PUSH_QUEUE = "message.gateway.push";
    public static final String CALLBACK_QUEUE = "message.gateway.callback";

    public static final String EMAIL_ROUTING_KEY = "email";
    public static final String SMS_ROUTING_KEY = "sms";
    public static final String PUSH_ROUTING_KEY = "push";
    public static final String CALLBACK_ROUTING_KEY = "callback";

    @Bean
    public DirectExchange exchange() {
        return new DirectExchange(EXCHANGE_NAME, true, false);
    }

    @Bean
    public Queue emailQueue() {
        return QueueBuilder.durable(EMAIL_QUEUE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_NAME)
                .withArgument("x-dead-letter-routing-key", "email.dlq")
                .build();
    }

    @Bean
    public Queue smsQueue() {
        return QueueBuilder.durable(SMS_QUEUE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_NAME)
                .withArgument("x-dead-letter-routing-key", "sms.dlq")
                .build();
    }

    @Bean
    public Queue pushQueue() {
        return QueueBuilder.durable(PUSH_QUEUE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_NAME)
                .withArgument("x-dead-letter-routing-key", "push.dlq")
                .build();
    }

    @Bean
    public Queue callbackQueue() {
        return QueueBuilder.durable(CALLBACK_QUEUE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_NAME)
                .withArgument("x-dead-letter-routing-key", "callback.dlq")
                .build();
    }

    @Bean
    public Queue emailDeadLetterQueue() {
        return QueueBuilder.durable("message.gateway.email.dlq").build();
    }

    @Bean
    public Queue smsDeadLetterQueue() {
        return QueueBuilder.durable("message.gateway.sms.dlq").build();
    }

    @Bean
    public Queue pushDeadLetterQueue() {
        return QueueBuilder.durable("message.gateway.push.dlq").build();
    }

    @Bean
    public Queue callbackDeadLetterQueue() {
        return QueueBuilder.durable("message.gateway.callback.dlq").build();
    }

    @Bean
    public Binding emailBinding(Queue emailQueue, DirectExchange exchange) {
        return BindingBuilder.bind(emailQueue).to(exchange).with(EMAIL_ROUTING_KEY);
    }

    @Bean
    public Binding smsBinding(Queue smsQueue, DirectExchange exchange) {
        return BindingBuilder.bind(smsQueue).to(exchange).with(SMS_ROUTING_KEY);
    }

    @Bean
    public Binding pushBinding(Queue pushQueue, DirectExchange exchange) {
        return BindingBuilder.bind(pushQueue).to(exchange).with(PUSH_ROUTING_KEY);
    }

    @Bean
    public Binding callbackBinding(Queue callbackQueue, DirectExchange exchange) {
        return BindingBuilder.bind(callbackQueue).to(exchange).with(CALLBACK_ROUTING_KEY);
    }

    @Bean
    public Binding emailDlqBinding(Queue emailDeadLetterQueue, DirectExchange exchange) {
        return BindingBuilder.bind(emailDeadLetterQueue).to(exchange).with("email.dlq");
    }

    @Bean
    public Binding smsDlqBinding(Queue smsDeadLetterQueue, DirectExchange exchange) {
        return BindingBuilder.bind(smsDeadLetterQueue).to(exchange).with("sms.dlq");
    }

    @Bean
    public Binding pushDlqBinding(Queue pushDeadLetterQueue, DirectExchange exchange) {
        return BindingBuilder.bind(pushDeadLetterQueue).to(exchange).with("push.dlq");
    }

    @Bean
    public Binding callbackDlqBinding(Queue callbackDeadLetterQueue, DirectExchange exchange) {
        return BindingBuilder.bind(callbackDeadLetterQueue).to(exchange).with("callback.dlq");
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jsonMessageConverter());
        rabbitTemplate.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack) {
                System.err.println("Message not confirmed: " + cause);
            }
        });
        rabbitTemplate.setReturnsCallback(returned -> {
            System.err.println("Message returned: " + returned.getMessage());
        });
        return rabbitTemplate;
    }

    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory,
            MessageConverter messageConverter,
            RetryOperationsInterceptor retryInterceptor) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setPrefetchCount(10);
        factory.setConcurrentConsumers(2);
        factory.setMaxConcurrentConsumers(10);
        factory.setAdviceChain(retryInterceptor);
        factory.setRecoveryInterval(5000L);
        return factory;
    }

    @Bean
    public RetryOperationsInterceptor retryInterceptor() {
        return RetryInterceptorBuilder.stateless()
                .maxAttempts(3)
                .backOffOptions(1000, 2.0, 10000)
                .build();
    }
}
