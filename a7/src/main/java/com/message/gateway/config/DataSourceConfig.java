package com.message.gateway.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

@Slf4j
@Configuration
public class DataSourceConfig {

    @Value("${spring.datasource.url}")
    private String jdbcUrl;

    @Value("${spring.datasource.username}")
    private String username;

    @Value("${spring.datasource.password}")
    private String password;

    @Value("${spring.datasource.driver-class-name}")
    private String driverClassName;

    @Bean
    @Primary
    public DataSource dataSource() {
        HikariConfig config = new HikariConfig();
        
        config.setJdbcUrl(jdbcUrl);
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName(driverClassName);

        config.setPoolName("MessageGatewayHikariPool");

        config.setMaximumPoolSize(30);
        config.setMinimumIdle(5);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);
        config.setConnectionTimeout(30000);
        config.setValidationTimeout(5000);

        config.setLeakDetectionThreshold(60000);

        config.setConnectionTestQuery("SELECT 1");
        config.setTestWhileIdle(true);
        config.setTestOnBorrow(false);
        config.setTestOnReturn(false);

        config.setInitializationFailTimeout(-1);
        config.setAllowPoolSuspension(false);

        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");
        config.addDataSourceProperty("useLocalSessionState", "true");
        config.addDataSourceProperty("rewriteBatchedStatements", "true");
        config.addDataSourceProperty("cacheResultSetMetadata", "true");
        config.addDataSourceProperty("cacheServerConfiguration", "true");
        config.addDataSourceProperty("elideSetAutoCommits", "true");
        config.addDataSourceProperty("maintainTimeStats", "false");

        config.setRegisterMbeans(true);

        HikariDataSource dataSource = new HikariDataSource(config);
        
        log.info("HikariCP DataSource initialized: poolName={}, maxPoolSize={}, minIdle={}",
                dataSource.getPoolName(), dataSource.getMaximumPoolSize(), dataSource.getMinimumIdle());

        return dataSource;
    }

    public void logConnectionPoolStats(HikariDataSource dataSource) {
        if (dataSource != null) {
            log.info("Connection Pool Stats - Active: {}, Idle: {}, Total: {}, Waiting: {}",
                    dataSource.getHikariPoolMXBean().getActiveConnections(),
                    dataSource.getHikariPoolMXBean().getIdleConnections(),
                    dataSource.getHikariPoolMXBean().getTotalConnections(),
                    dataSource.getHikariPoolMXBean().getThreadsAwaitingConnection());
        }
    }
}
