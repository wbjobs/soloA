package com.game.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class MessageExecutorService {
    
    @Value("${netty.executor.core-size:16}")
    private int corePoolSize;
    
    @Value("${netty.executor.max-size:32}")
    private int maxPoolSize;
    
    @Value("${netty.executor.queue-size:1000}")
    private int queueSize;
    
    private ThreadPoolExecutor businessExecutor;
    private ScheduledExecutorService scheduledExecutor;
    
    @PostConstruct
    public void init() {
        ThreadFactory threadFactory = new ThreadFactory() {
            private final AtomicInteger counter = new AtomicInteger(0);
            
            @Override
            public Thread newThread(Runnable r) {
                Thread thread = new Thread(r, "game-executor-" + counter.incrementAndGet());
                thread.setDaemon(false);
                return thread;
            }
        };
        
        businessExecutor = new ThreadPoolExecutor(
                corePoolSize,
                maxPoolSize,
                60L,
                TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(queueSize),
                threadFactory,
                new ThreadPoolExecutor.CallerRunsPolicy()
        );
        
        scheduledExecutor = Executors.newScheduledThreadPool(4, new ThreadFactory() {
            private final AtomicInteger counter = new AtomicInteger(0);
            
            @Override
            public Thread newThread(Runnable r) {
                Thread thread = new Thread(r, "game-scheduler-" + counter.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            }
        });
        
        log.info("MessageExecutorService initialized: core={}, max={}, queue={}", 
                corePoolSize, maxPoolSize, queueSize);
    }
    
    @PreDestroy
    public void shutdown() {
        log.info("Shutting down MessageExecutorService...");
        
        if (scheduledExecutor != null) {
            scheduledExecutor.shutdown();
            try {
                if (!scheduledExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                    scheduledExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduledExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        
        if (businessExecutor != null) {
            businessExecutor.shutdown();
            try {
                if (!businessExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                    businessExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                businessExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        
        log.info("MessageExecutorService shutdown complete");
    }
    
    public void execute(Runnable task) {
        businessExecutor.execute(task);
    }
    
    public Future<?> submit(Runnable task) {
        return businessExecutor.submit(task);
    }
    
    public <T> Future<T> submit(Callable<T> task) {
        return businessExecutor.submit(task);
    }
    
    public void scheduleAtFixedRate(Runnable task, long initialDelay, long period, TimeUnit unit) {
        scheduledExecutor.scheduleAtFixedRate(task, initialDelay, period, unit);
    }
    
    public ScheduledFuture<?> schedule(Runnable task, long delay, TimeUnit unit) {
        return scheduledExecutor.schedule(task, delay, unit);
    }
    
    public int getActiveCount() {
        return businessExecutor.getActiveCount();
    }
    
    public int getQueueSize() {
        return businessExecutor.getQueue().size();
    }
    
    public long getCompletedTaskCount() {
        return businessExecutor.getCompletedTaskCount();
    }
}
