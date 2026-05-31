package com.message.gateway.repository;

import com.message.gateway.entity.CallbackLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CallbackLogRepository extends JpaRepository<CallbackLog, Long> {

    List<CallbackLog> findByMessageId(String messageId);
}
