package com.message.gateway.controller;

import com.message.gateway.dto.MetricsSummary;
import com.message.gateway.service.MetricsQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/metrics")
public class MetricsController {

    @Autowired
    private MetricsQueryService metricsQueryService;

    @GetMapping("/summary")
    public ResponseEntity<MetricsSummary> getOverallSummary(
            @RequestParam(defaultValue = "7") int days) {
        MetricsSummary summary = metricsQueryService.getOverallSummary(days);
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/realtime")
    public ResponseEntity<Map<String, Object>> getRealtimeStatus() {
        Map<String, Object> status = metricsQueryService.getRealtimeStatus();
        return ResponseEntity.ok(status);
    }

    @GetMapping("/channel/{channelType}")
    public ResponseEntity<List<Map<String, Object>>> getProviderPerformance(
            @PathVariable String channelType) {
        List<Map<String, Object>> performance = 
                metricsQueryService.getProviderPerformance(channelType.toUpperCase());
        return ResponseEntity.ok(performance);
    }

    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> getOverview() {
        Map<String, Object> overview = new HashMap<>();
        
        MetricsSummary summary = metricsQueryService.getOverallSummary(7);
        Map<String, Object> realtime = metricsQueryService.getRealtimeStatus();

        overview.put("weekly", summary);
        overview.put("realtime", realtime);
        
        return ResponseEntity.ok(overview);
    }
}
