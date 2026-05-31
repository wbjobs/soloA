package com.message.gateway.repository;

import com.message.gateway.entity.Message;
import com.message.gateway.enums.MessageStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    Optional<Message> findByMessageId(String messageId);

    @Modifying
    @Query("UPDATE Message m SET m.status = :status, m.errorMessage = :errorMessage, m.retryCount = :retryCount WHERE m.messageId = :messageId")
    void updateStatus(@Param("messageId") String messageId, 
                      @Param("status") MessageStatus status, 
                      @Param("errorMessage") String errorMessage,
                      @Param("retryCount") Integer retryCount);

    @Modifying
    @Query("UPDATE Message m SET m.status = :status, m.providerName = :providerName, m.sentAt = CURRENT_TIMESTAMP WHERE m.messageId = :messageId")
    void updateSuccessStatus(@Param("messageId") String messageId, 
                             @Param("providerName") String providerName,
                             @Param("status") MessageStatus status);
}
