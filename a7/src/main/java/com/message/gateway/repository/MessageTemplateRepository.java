package com.message.gateway.repository;

import com.message.gateway.entity.MessageTemplate;
import com.message.gateway.enums.ChannelType;
import com.message.gateway.enums.TemplateStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, Long> {

    Optional<MessageTemplate> findByTemplateCode(String templateCode);

    @Query("SELECT t FROM MessageTemplate t WHERE t.templateCode = :templateCode AND t.status = :status")
    Optional<MessageTemplate> findActiveByCode(@Param("templateCode") String templateCode, 
                                                @Param("status") TemplateStatus status);

    @Query("SELECT t FROM MessageTemplate t WHERE t.templateCode = :templateCode AND t.status = 'ACTIVE' " +
           "AND (t.businessId = :businessId OR t.businessId IS NULL OR t.businessId = '') " +
           "ORDER BY CASE WHEN t.businessId = :businessId THEN 0 ELSE 1 END")
    List<MessageTemplate> findActiveByCodeAndBusiness(@Param("templateCode") String templateCode,
                                                      @Param("businessId") String businessId);

    List<MessageTemplate> findByBusinessId(String businessId);

    List<MessageTemplate> findByChannelType(ChannelType channelType);

    List<MessageTemplate> findByBusinessIdAndChannelType(String businessId, ChannelType channelType);

    List<MessageTemplate> findByStatus(TemplateStatus status);
}
