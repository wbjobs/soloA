package com.message.gateway.repository;

import com.message.gateway.entity.MessageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageLogRepository extends JpaRepository<MessageLog, Long> {

    List<MessageLog> findByMessageId(String messageId);
}
