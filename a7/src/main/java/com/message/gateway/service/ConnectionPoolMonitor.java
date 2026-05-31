package com.message.gateway.service;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;

@Slf4j
@Service
public class ConnectionPoolMonitor {

    @Autowired
    private DataSource dataSource;

    @Scheduled(fixedRate = 30000)
    public void logConnectionPoolStats() {
        if (dataSource instanceof HikariDataSource) {
            HikariDataSource hikariDataSource = (HikariDataSource) dataSource;
            try {
                HikariPoolMXBean poolMXBean = hikariDataSource.getHikariPoolMXBean();
                if (poolMXBean != null) {
                    int activeConnections = poolMXBean.getActiveConnections();
                    int idleConnections = poolMXBean.getIdleConnections();
                    int totalConnections = poolMXBean.getTotalConnections();
                    int threadsAwaiting = poolMXBean.getThreadsAwaitingConnection();

                    log.info("Connection Pool Stats - Active: {}, Idle: {}, Total: {}, Waiting: {}",
                            activeConnections, idleConnections, totalConnections, threadsAwaiting);

                    int maxPoolSize = hikariDataSource.getMaximumPoolSize();
                    double usagePercentage = (double) activeConnections / maxPoolSize * 100;

                    if (usagePercentage > 80) {
                        log.warn("Connection pool usage is high: {}% (active={}, max={})",
                                Math.round(usagePercentage), activeConnections, maxPoolSize);
                    }

                    if (threadsAwaiting > 0) {
                        log.warn("There are {} threads waiting for a connection", threadsAwaiting);
                    }

                    if (activeConnections >= maxPoolSize) {
                        log.error("Connection pool is full! Consider increasing maxPoolSize");
                    }
                }
            } catch (Exception e) {
                log.debug("Error getting connection pool stats: {}", e.getMessage());
            }
        }
    }
}
