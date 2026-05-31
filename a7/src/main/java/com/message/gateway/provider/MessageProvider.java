package com.message.gateway.provider;

import com.message.gateway.entity.Message;

public interface MessageProvider {

    String getName();

    boolean supports(String channelType);

    int getPriority();

    boolean isEnabled();

    boolean send(Message message) throws Exception;
}
